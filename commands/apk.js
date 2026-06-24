import fs from 'fs-extra';
import AdmZip from 'adm-zip';
import path from 'path';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';

// ─── STRING EXTRACTORS ────────────────────────────────────────────────────────
function extractStringsFromBuffer(buffer, minLen = 6) {
    const results = [];
    let current = '';
    for (let i = 0; i < buffer.length; i++) {
        const byte = buffer[i];
        if (byte >= 0x20 && byte < 0x7f) {
            current += String.fromCharCode(byte);
        } else {
            if (current.length >= minLen) results.push(current);
            current = '';
        }
    }
    if (current.length >= minLen) results.push(current);
    return results;
}

function extractUtf16Strings(buffer, minLen = 3) {
    const results = [];
    let current = '';
    for (let i = 0; i < buffer.length - 1; i++) {
        const lo = buffer[i];
        const hi = buffer[i + 1];
        if (lo >= 0x20 && lo < 0x7f && hi === 0x00) {
            current += String.fromCharCode(lo);
            i++;
        } else {
            if (current.length >= minLen) results.push(current);
            current = '';
        }
    }
    if (current.length >= minLen) results.push(current);
    return results.join('\n');
}

function readManifestStrings(buffer) {
    return extractStringsFromBuffer(buffer, 4).join('\n');
}

// ─── AXML BINARY MANIFEST DECODER ────────────────────────────────────────────
function parseAxmlStringPool(buf) {
    if (buf.length < 8) return [];
    const magic = buf.readUInt32LE(0);
    if (magic !== 0x00080003) return [];

    const strPoolOffset = 8;
    if (buf.length < strPoolOffset + 28) return [];

    const chunkType    = buf.readUInt32LE(strPoolOffset);
    if (chunkType !== 0x001C0001) return [];

    const stringCount  = buf.readUInt32LE(strPoolOffset + 8);
    const flags        = buf.readUInt32LE(strPoolOffset + 16);
    const stringsStart = buf.readUInt32LE(strPoolOffset + 20);
    const isUtf8       = (flags & (1 << 8)) !== 0;

    const offsetsBase  = strPoolOffset + 28;
    const strDataBase  = strPoolOffset + stringsStart;
    const strings      = [];

    for (let i = 0; i < stringCount; i++) {
        const offPtr = offsetsBase + i * 4;
        if (offPtr + 4 > buf.length) break;
        const off = buf.readUInt32LE(offPtr);
        const absOff = strDataBase + off;
        if (absOff >= buf.length) continue;

        try {
            if (isUtf8) {
                let pos = absOff;
                if (buf[pos] & 0x80) pos += 2; else pos += 1;
                let utf8Len = buf[pos];
                if (utf8Len & 0x80) { utf8Len = ((utf8Len & 0x7F) << 8) | buf[pos + 1]; pos += 2; }
                else pos += 1;
                if (pos + utf8Len > buf.length) continue;
                strings.push(buf.slice(pos, pos + utf8Len).toString('utf8'));
            } else {
                if (absOff + 2 > buf.length) continue;
                let charCount = buf.readUInt16LE(absOff);
                if (charCount & 0x8000) {
                    charCount = ((charCount & 0x7FFF) << 16) | buf.readUInt16LE(absOff + 2);
                }
                const start = absOff + 2;
                const byteLen = charCount * 2;
                if (start + byteLen > buf.length) continue;
                strings.push(buf.slice(start, start + byteLen).toString('utf16le'));
            }
        } catch { continue; }
    }
    return strings;
}

function extractPackageFromAxml(buf) {
    const axmlStrings = parseAxmlStringPool(buf);
    if (axmlStrings.length > 0) {
        for (const s of axmlStrings) {
            if (
                s && s.length >= 5 && s.length <= 80 &&
                /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]+){1,6}$/.test(s) &&
                !s.startsWith('android.') &&
                !s.startsWith('com.google.android.') &&
                !s.startsWith('androidx.') &&
                !s.includes('schemas.android') &&
                !s.includes('w3.org')
            ) {
                return s;
            }
        }
        for (const s of axmlStrings) {
            if (s && /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]+){1,6}$/.test(s) && s.includes('.')) {
                return s;
            }
        }
    }

    const strings = extractStringsFromBuffer(buf, 5);
    for (const s of strings) {
        if (
            /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,6}$/.test(s) &&
            s.includes('.') &&
            !s.includes('android.permission') &&
            !s.includes('schemas.android') &&
            !s.includes('w3.org') &&
            s.split('.').length >= 2 &&
            s.length >= 5 && s.length <= 60
        ) {
            return s;
        }
    }
    return null;
}

// ─── SMALI METHOD EXTRACTOR ───────────────────────────────────────────────────
function extractSmaliMethod(content, lineInfo) {
    if (!lineInfo || !lineInfo.lineStart) return null;
    const lines = content.split('\n');
    let start = lineInfo.lineStart - 1;
    let end = start;

    // Tafuta .method juu
    while (start > 0 && !lines[start].trim().startsWith('.method')) {
        start--;
    }
    // Tafuta .end method chini
    while (end < lines.length && !lines[end].trim().startsWith('.end method')) {
        end++;
    }

    if (start < 0 || end >= lines.length || !lines[start].includes('.method')) return null;

    const methodCode = lines.slice(start, end + 1).join('\n');
    return {
        code: methodCode,
        startLine: start + 1,
        endLine: end + 1
    };
}

// ─── TIMEOUT & FILE UTILS ─────────────────────────────────────────────────────
function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout baada ya ${ms / 1000}s`)), ms)
        )
    ]);
}

async function collectFiles(dir, maxDepth = 4, currentDepth = 0) {
    if (currentDepth >= maxDepth) return [];
    const results = [];
    let entries;
    try { entries = await fs.readdir(dir); } catch { return []; }
    for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        let stat;
        try { stat = await fs.stat(fullPath); } catch { continue; }
        if (stat.isDirectory()) {
            results.push(...await collectFiles(fullPath, maxDepth, currentDepth + 1));
        } else {
            results.push(fullPath);
        }
    }
    return results;
}

// ─── APK SIGNING INFO ─────────────────────────────────────────────────────────
async function readApkSigningInfo(outputDir) {
    const metaDir = path.join(outputDir, 'META-INF');
    const info = { signerFiles: [], certDetails: [], signatureScheme: 'V1 (JAR Signing)' };
    try {
        const entries = await fs.readdir(metaDir);
        for (const entry of entries) {
            const upper = entry.toUpperCase();
            if (upper.endsWith('.RSA') || upper.endsWith('.DSA') || upper.endsWith('.EC')) {
                info.signerFiles.push(entry);
                const buf = await fs.readFile(path.join(metaDir, entry));

                const asciiStrings = extractStringsFromBuffer(buf, 3).join('\n');
                const utf16Strings = extractUtf16Strings(buf);
                const combined = asciiStrings + '\n' + utf16Strings;

                const cnMatch    = combined.match(/CN=([^\n,\0]+)/);
                const oMatch     = combined.match(/(?<![A-Z])O=([^\n,\0]+)/);
                const ouMatch    = combined.match(/OU=([^\n,\0]+)/);
                const cMatch     = combined.match(/(?<![A-Z])C=([A-Z]{2})/);
                const emailMatch = combined.match(/emailAddress=([^\n,\0]+)/i);

                if (cnMatch)    info.certDetails.push(`CN: ${cnMatch[1].trim()}`);
                if (oMatch)     info.certDetails.push(`Org: ${oMatch[1].trim()}`);
                if (ouMatch)    info.certDetails.push(`Unit: ${ouMatch[1].trim()}`);
                if (cMatch)     info.certDetails.push(`Country: ${cMatch[1].trim()}`);
                if (emailMatch) info.certDetails.push(`Email: ${emailMatch[1].trim()}`);

                const isDebug = combined.toLowerCase().includes('android debug') ||
                                combined.toLowerCase().includes('androiddebugkey');
                if (isDebug) info.certDetails.push('⚠️ DEBUG KEY — Hii si production!');

                if (upper.includes('BNDLTOOL')) {
                    info.certDetails.push('ℹ️ Imesainiwa na Android Bundletool (Google)');
                }
            }
            if (upper.endsWith('.SF')) info.signerFiles.push(entry);
        }
        info.signatureScheme = info.signerFiles.length === 0
            ? 'V2/V3 (APK Signing Block) — META-INF haina .RSA'
            : `V1 (JAR) — Files: ${info.signerFiles.join(', ')}`;
    } catch {
        info.signatureScheme = 'Haijulikani (META-INF haipo)';
    }
    return info;
}

// ─── SECRET DETECTION ─────────────────────────────────────────────────────────
function detectSecrets(content, fileName, results) {
    for (const { type, regex } of SECRET_PATTERNS) {
        const match = content.match(regex);
        if (match) {
            const preview = match[0].substring(0, 40) + (match[0].length > 40 ? '...' : '');
            if (!results.some(r => r.type === type && r.file === fileName)) {
                results.push({ type, file: fileName, preview });
            }
        }
    }
}

// ─── RISK SCORE ───────────────────────────────────────────────────────────────
function calcRisk(paymentMap, permissions, secrets) {
    let score = 0;
    score += Math.min(paymentMap.size * 0.5, 3);
    score += Math.min(permissions.filter(p => DANGEROUS_PERMS[p]).length * 0.8, 4);
    score += Math.min(secrets.length * 1.5, 3);
    score = Math.min(Math.round(score), 10);
    let badge;
    if (score <= 2)      badge = '🟢 Chini';
    else if (score <= 5) badge = '🟡 Wastani';
    else if (score <= 7) badge = '🟠 Juu';
    else                 badge = '🔴 Hatari Sana';
    return { score, badge };
}

// ─── LINE FINDER HELPERS ──────────────────────────────────────────────────────
function findMatchLine(content, pattern) {
    const idx = content.search(pattern);
    if (idx === -1) return { lineStart: null, lineEnd: null };
    const before = content.substring(0, idx);
    const lineStart = before.split('\n').length;
    const lineEnd = lineStart;
    return { lineStart, lineEnd };
}

function addToMap(map, label, baseName, lineInfo) {
    if (!map.has(label)) map.set(label, []);
    const arr = map.get(label);
    if (!arr.some(e => e.file === baseName)) {
        arr.push({ file: baseName, ...lineInfo });
    }
}

function formatEntries(entries, max = 2) {
    return [...new Map(entries.map(e => [e.file, e])).values()]
        .slice(0, max)
        .map(e => {
            const loc = e.lineStart
                ? ` (mst. ${e.lineStart}${e.lineEnd !== e.lineStart ? '–' + e.lineEnd : ''})`
                : '';
            return `\`${e.file}\` ${loc}`;
        })
        .join(', ');
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MAX_APK_MB       = 80;
const MAX_FILE_READ_MB = 15;

const PAYMENT_KEYWORDS = [
    { key: 'mpesa',       label: 'M-Pesa (Safaricom/Vodacom)', risk: 'high' },
    { key: 'tigopesa',    label: 'Tigo Pesa',                  risk: 'high' },
    { key: 'airtelmoney', label: 'Airtel Money',               risk: 'high' },
    { key: 'halopesa',    label: 'HaloPesa',                   risk: 'high' },
    { key: 'azampay',     label: 'AzamPay',                    risk: 'high' },
    { key: 'selcom',      label: 'Selcom',                     risk: 'high' },
    { key: 'pesalink',    label: 'PesaLink',                   risk: 'high' },
    { key: 'nmbbank',     label: 'NMB Bank',                   risk: 'medium' },
    { key: 'crdbbank',    label: 'CRDB Bank',                  risk: 'medium' },
    { key: 'stripe',      label: 'Stripe',                     risk: 'medium' },
    { key: 'paypal',      label: 'PayPal',                     risk: 'medium' },
    { key: 'flutterwave', label: 'Flutterwave',                risk: 'medium' },
    { key: 'paystack',    label: 'Paystack',                   risk: 'medium' },
    { key: 'razorpay',    label: 'Razorpay',                   risk: 'medium' },
    { key: 'braintree',   label: 'Braintree',                  risk: 'medium' },
    { key: 'checkout',    label: 'Checkout Flow',              risk: 'low' },
    { key: 'billing',     label: 'Billing System',             risk: 'low' },
    { key: 'payment',     label: 'Payment Generic',            risk: 'low' },
    { key: 'transaction', label: 'Transaction',                risk: 'low' },
    { key: 'wallet',      label: 'Wallet',                     risk: 'low' },
    { key: 'subscribe',   label: 'Subscription',               risk: 'low' },
];

const DANGEROUS_PERMS = {
    READ_SMS:                 '🔴 Inasoma SMS (M-Pesa codes!)',
    RECEIVE_SMS:              '🔴 Inakabidhi SMS',
    RECORD_AUDIO:             '🔴 Inaweza kurekodi sauti',
    CAMERA:                   '🟠 Inatumia kamera',
    ACCESS_FINE_LOCATION:     '🟠 GPS halisi',
    ACCESS_COARSE_LOCATION:   '🟡 Mahali takriban',
    READ_CONTACTS:            '🟠 Inasoma contacts',
    READ_CALL_LOG:            '🔴 Inasoma call log',
    PROCESS_OUTGOING_CALLS:   '🔴 Inadhibiti simu',
    READ_PHONE_STATE:         '🟡 Inasoma IMEI/SIM',
    SEND_SMS:                 '🔴 Inatuma SMS',
    INSTALL_PACKAGES:         '🔴 Inaweza kufunga apps',
    REQUEST_INSTALL_PACKAGES: '🔴 Inaomba kufunga apps',
    DISABLE_KEYGUARD:         '🔴 Inazima lock screen',
    SYSTEM_ALERT_WINDOW:      '🟠 Overlay juu ya apps',
    RECEIVE_BOOT_COMPLETED:   '🟡 Inaanza na boot',
    FOREGROUND_SERVICE:       '🟡 Inaendesha background',
};

const PAYMENT_CONFIRM_PATTERNS = [
    { pattern: /payment[_\s]?callback/i,                label: 'Payment Callback URL/Method' },
    { pattern: /webhook/i,                               label: 'Webhook Handler' },
    { pattern: /\bipn\b/i,                               label: 'IPN (Instant Payment Notification)' },
    { pattern: /notify[_\s]?url/i,                       label: 'Notify URL (callback endpoint)' },
    { pattern: /callback[_\s]?url/i,                     label: 'Callback URL' },
    { pattern: /payment[_\s]?status/i,                   label: 'Payment Status Check' },
    { pattern: /transaction[_\s]?status/i,               label: 'Transaction Status Check' },
    { pattern: /order[_\s]?status/i,                     label: 'Order Status Check' },
    { pattern: /verif(y|ication)[_\s]?payment/i,         label: 'Payment Verification' },
    { pattern: /confirm[_\s]?payment/i,                  label: 'Payment Confirmation' },
    { pattern: /payment[_\s]?confirm/i,                  label: 'Payment Confirmation (alt)' },
    { pattern: /ResultCode/i,                            label: 'ResultCode (M-Pesa style response)' },
    { pattern: /ResponseCode/i,                          label: 'ResponseCode handler' },
    { pattern: /CheckoutRequestID/i,                     label: 'CheckoutRequestID (M-Pesa STK Push)' },
    { pattern: /MerchantRequestID/i,                     label: 'MerchantRequestID (M-Pesa)' },
    { pattern: /transactionId/i,                         label: 'Transaction ID handler' },
    { pattern: /paymentReference/i,                      label: 'Payment Reference' },
    { pattern: /receiptNumber/i,                         label: 'Receipt Number (M-Pesa)' },
    { pattern: /receipt[_\s]?id/i,                       label: 'Receipt ID' },
    { pattern: /payment[_\s]?success/i,                  label: 'Payment Success Handler' },
    { pattern: /payment[_\s]?(fail|error|decline)/i,     label: 'Payment Failure Handler' },
    { pattern: /onPaymentResult/i,                       label: 'onPaymentResult callback' },
    { pattern: /onPaymentSuccess/i,                      label: 'onPaymentSuccess callback' },
    { pattern: /onPaymentFailed/i,                       label: 'onPaymentFailed callback' },
    { pattern: /purchaseListener/i,                      label: 'Purchase Listener' },
    { pattern: /BillingResult/i,                         label: 'Google Play BillingResult' },
    { pattern: /PurchasesUpdatedListener/i,              label: 'Google Play PurchasesUpdatedListener' },
    { pattern: /onPurchasesUpdated/i,                    label: 'Google Play onPurchasesUpdated' },
    { pattern: /acknowledgePurchase/i,                   label: 'Google Play acknowledgePurchase (confirm)' },
    { pattern: /consumePurchase/i,                       label: 'Google Play consumePurchase' },
    { pattern: /Purchase\.getPurchaseState/i,            label: 'Google Play getPurchaseState' },
    { pattern: /PURCHASE_STATE_PURCHASED/i,              label: 'Google Play PURCHASED state' },
    { pattern: /PaymentIntent/i,                         label: 'Stripe PaymentIntent' },
    { pattern: /confirmPayment/i,                        label: 'Stripe confirmPayment' },
    { pattern: /SetupIntent/i,                           label: 'Stripe SetupIntent' },
    { pattern: /\/api\/.*(pay|order|checkout|confirm)/i, label: 'Payment API Endpoint' },
    { pattern: /\/pay\//i,                               label: 'Pay API path' },
    { pattern: /\/confirm\//i,                           label: 'Confirm API path' },
];

const SIGNING_PATTERNS = [
    { pattern: /HmacSHA(256|512|1)/i,        label: 'HMAC-SHA Signature' },
    { pattern: /HmacMD5/i,                   label: 'HMAC-MD5 Signature' },
    { pattern: /SHA-?(256|512|1)/i,          label: 'SHA Hash' },
    { pattern: /\bMD5\b/i,                   label: 'MD5 Hash' },
    { pattern: /\bRSA\b/i,                   label: 'RSA Encryption' },
    { pattern: /\bAES\b/i,                   label: 'AES Encryption' },
    { pattern: /\bBase64\b/i,                label: 'Base64 Encoding' },
    { pattern: /JsonWebToken|JWT/i,          label: 'JWT Token' },
    { pattern: /Bearer\s+/i,                 label: 'Bearer Token Auth' },
    { pattern: /api[_\-]?key\s*[:=]/i,       label: 'API Key in config' },
    { pattern: /secret[_\-]?key\s*[:=]/i,    label: 'Secret Key in config' },
    { pattern: /signatureKey/i,              label: 'Signature Key' },
    { pattern: /privateKey/i,               label: 'Private Key reference' },
    { pattern: /publicKey/i,                label: 'Public Key reference' },
    { pattern: /CertificatePinner/i,         label: 'Certificate Pinning (OkHttp)' },
    { pattern: /TrustManager/i,              label: 'Custom TrustManager (SSL)' },
    { pattern: /SSLContext/i,                label: 'SSLContext setup' },
    { pattern: /X509/i,                      label: 'X.509 Certificate' },
    { pattern: /v[123]SigningEnabled/i,      label: 'APK Signing Scheme v1/v2/v3' },
    { pattern: /Interceptor/i,               label: 'HTTP Interceptor (request signing)' },
    { pattern: /addHeader.*Authorization/i,  label: 'Authorization Header injection' },
];

const SECRET_PATTERNS = [
    { type: 'Firebase API Key',   regex: /AIza[0-9A-Za-z\-_]{35}/ },
    { type: 'Google OAuth',       regex: /[0-9]+-[0-9A-Za-z_]{32}\.apps\.googleusercontent\.com/ },
    { type: 'AWS Key',            regex: /AKIA[0-9A-Z]{16}/ },
    { type: 'Stripe Secret Key',  regex: /sk_(live|test)_[0-9a-zA-Z]{24,}/ },
    { type: 'Stripe Public Key',  regex: /pk_(live|test)_[0-9a-zA-Z]{24,}/ },
    { type: 'Private Key Header', regex: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/ },
    { type: 'Generic Secret',     regex: /(?:secret|api[_-]?key|private[_-]?key)\s*[=:]\s*["']([A-Za-z0-9\-_./+]{16,})["']/i },
    { type: 'Bearer Token',       regex: /Bearer\s+[A-Za-z0-9\-_=+/]{20,}/ },
];

const LICENSE_PATCH_PATTERNS = [
    { pattern: /isPremium|isPaid|isSubscribed|isPurchased/i,        label: 'Premium Status Flag' },
    { pattern: /hasPurchased|hasSubscription|hasPro|hasLicense/i,   label: 'Purchase State Flag' },
    { pattern: /isUnlocked|isActivated|isLicensed|isFull/i,         label: 'Unlock/License Flag' },
    { pattern: /premiumUser|proUser|paidUser|vipUser/i,              label: 'User Tier Variable' },
    { pattern: /LicenseChecker|LicenseValidator|LicenseManager/i,   label: 'License Checker Class' },
    { pattern: /checkLicense|validateLicense|verifyLicense/i,        label: 'License Validation Method' },
    { pattern: /LICENSED|NOT_LICENSED|RETRY/i,                       label: 'Android LVL Response Codes' },
    { pattern: /com\.android\.vending\.licensing/i,                  label: 'Google Play License Verification Library (LVL)' },
    { pattern: /Policy\.LICENSED/i,                                  label: 'LVL Policy Check' },
    { pattern: /ServerManagedPolicy|StrictPolicy/i,                  label: 'LVL Policy Class' },
    { pattern: /AESObfuscator/i,                                     label: 'LVL AES Obfuscator (license key storage)' },
    { pattern: /verif(y|ication)[_\s]?(token|key|code|purchase)/i,  label: 'Server Verification Call' },
    { pattern: /validatePurchase|verifyPurchase|verifyReceipt/i,     label: 'Purchase Verification' },
    { pattern: /\/api\/.*(licen|verif|subscri|premium|paid)/i,       label: 'License/Premium API Endpoint' },
    { pattern: /receipt[_\s]?validat/i,                              label: 'Receipt Validation' },
    { pattern: /purchaseToken/i,                                     label: 'Purchase Token (Play Billing)' },
    { pattern: /originalTransactionId/i,                             label: 'Original Transaction ID (iOS style)' },
    { pattern: /acknowledgePurchase/i,                               label: 'Play Billing: acknowledgePurchase (CRITICAL)' },
    { pattern: /onPurchasesUpdated/i,                                label: 'Play Billing: onPurchasesUpdated' },
    { pattern: /BillingClient\.newBuilder/i,                         label: 'Play BillingClient Init' },
    { pattern: /launchBillingFlow/i,                                 label: 'Play: launchBillingFlow (payment trigger)' },
    { pattern: /queryPurchasesAsync|queryPurchaseHistoryAsync/i,     label: 'Play: Query Purchase History' },
    { pattern: /Purchase\.PurchaseState\.PURCHASED/i,                label: 'Play: PURCHASED state check' },
    { pattern: /activationCode|serialKey|licenseKey|productKey/i,    label: 'Activation/Serial Key' },
    { pattern: /activat(e|ion)[_\s]?(server|url|endpoint)/i,         label: 'Activation Server Call' },
    { pattern: /registerDevice|deviceRegistration/i,                 label: 'Device Registration' },
    { pattern: /trialExpir|trialEnd|trialPeriod|trialDays/i,         label: 'Trial Expiry Logic' },
    { pattern: /expiryDate|expirationDate|subscriptionEnd/i,         label: 'Subscription Expiry Date' },
    { pattern: /gracePeriod/i,                                       label: 'Grace Period Logic' },
    { pattern: /isExpired|hasExpired|checkExpiry/i,                  label: 'Expiry Check' },
    { pattern: /featureFlag|featureGate|featureEnabled/i,            label: 'Feature Flag/Gate' },
    { pattern: /isFeatureAvailable|isFeatureEnabled/i,               label: 'Feature Availability Check' },
    { pattern: /premiumFeature|proFeature|paidFeature/i,             label: 'Premium Feature Gate' },
    { pattern: /unlockFeature|lockFeature/i,                         label: 'Feature Lock/Unlock' },
    { pattern: /checkSignature|verifySignature|getSignature/i,       label: '⚠️ Signature Integrity Check' },
    { pattern: /PackageManager.*GET_SIGNATURES/i,                    label: '⚠️ APK Signature Verification' },
    { pattern: /SafetyNet|PlayIntegrity|attestation/i,               label: '⚠️ Google SafetyNet/Play Integrity' },
    { pattern: /isRooted|detectRoot|RootBeer/i,                      label: '⚠️ Root Detection' },
    { pattern: /isEmulator|detectEmulator/i,                         label: '⚠️ Emulator Detection' },
    { pattern: /tamper|integrity[_\s]?check/i,                       label: '⚠️ Tamper Detection' },
    { pattern: /CRC|checksum/i,                                      label: '⚠️ Checksum Verification' },
    { pattern: /proguard|r8|obfuscat/i,                              label: 'Code Obfuscation (ProGuard/R8)' },
];

// ─── MAIN COMMAND ─────────────────────────────────────────────────────────────
const cmd = {
    name: 'chambua',
    alias: ['apk', 'analyzeapk'],
    description: 'Uchambuzi wa kina wa APK — malipo, signing, secrets, permissions, license/patch + Smali halisi',
    category: 'tools',

    async execute(sock, msg, args) {
        const chatJid     = msg.key.remoteJid;
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        const quotedMsg   = contextInfo?.quotedMessage;
        const documentMessage = msg.message?.documentMessage || quotedMsg?.documentMessage;

        if (!documentMessage) {
            return await sock.sendMessage(chatJid, {
                text: '❌ Tuma faili la APK au reply kwenye APK kisha andika amri hii.'
            }, { quoted: msg });
        }

        const mime       = documentMessage.mimetype || '';
        const fileName   = documentMessage.fileName || 'unknown.apk';
        const fileSize   = documentMessage.fileLength || 0;
        const fileSizeMB = (fileSize / 1024 / 1024).toFixed(1);

        if (!mime.includes('android') && !fileName.toLowerCase().endsWith('.apk')) {
            return await sock.sendMessage(chatJid, {
                text: '❌ Faili hili halionekani kuwa APK ya Android.'
            }, { quoted: msg });
        }

        if (fileSize > MAX_APK_MB * 1024 * 1024) {
            return await sock.sendMessage(chatJid, {
                text: `❌ APK ni kubwa sana (${fileSizeMB}MB). Kikomo ni ${MAX_APK_MB}MB.`
            }, { quoted: msg });
        }

        await sock.sendMessage(chatJid, {
            text: `🕵️‍♂️ *Inaanza Uchambuzi wa Kina...*\n📦 Faili: \`${fileName}\` (${fileSizeMB}MB)\n_Subiri kidogo..._`
        }, { quoted: msg });

        const timestamp = Date.now();
        const apkPath   = path.join(process.cwd(), `temp_apk_${timestamp}.apk`);
        const outputDir = path.join(process.cwd(), `extracted_apk_${timestamp}`);

        try {
            await withTimeout(runAnalysis(), 120_000);

            async function runAnalysis() {
                // Download
                const stream = await downloadContentFromMessage(documentMessage, 'document');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                await fs.writeFile(apkPath, buffer);

                // Extract
                const zip = new AdmZip(apkPath);
                await fs.ensureDir(outputDir);
                zip.extractAllTo(outputDir, true);

                const signingInfo = await readApkSigningInfo(outputDir);
                const allFiles = await collectFiles(outputDir, 4);

                // Accumulators
                const foundUrls    = new Set();
                const paymentMap   = new Map();
                const confirmMap   = new Map();
                const signingMap   = new Map();
                const licenseMap   = new Map();
                const smaliMatches = new Map(); // label → real smali methods
                const secretsFound = [];
                const permissions  = [];
                let packageName    = 'Haijulikani';
                let appVersion     = '';
                let minSdk         = '';
                let targetSdk      = '';

                for (const fullPath of allFiles) {
                    const relName  = path.relative(outputDir, fullPath);
                    const baseName = path.basename(fullPath);
                    const ext      = path.extname(fullPath).toLowerCase();
                    const fileStat = await fs.stat(fullPath);

                    if (fileStat.size > MAX_FILE_READ_MB * 1024 * 1024) continue;

                    let content = '';

                    try {
                        if (ext === '.dex') {
                            const buf = await fs.readFile(fullPath);
                            content = extractStringsFromBuffer(buf).join('\n');
                        } else if (baseName === 'AndroidManifest.xml') {
                            const buf = await fs.readFile(fullPath);
                            const text = buf.toString('utf8');
                            const isText = text.includes('<?xml') || text.includes('manifest');
                            content = isText ? text : readManifestStrings(buf);

                            if (packageName === 'Haijulikani') {
                                if (isText) {
                                    const pkgMatch = content.match(/package[=\s:]+["']?([a-z][a-z0-9_.]+)/i);
                                    if (pkgMatch) packageName = pkgMatch[1];
                                } else {
                                    const pkg = extractPackageFromAxml(buf);
                                    if (pkg) packageName = pkg;
                                }
                            }
                        } else if (ext === '.smali' || ['.xml','.json','.js','.html','.txt','.properties','.yaml','.yml','.gradle'].includes(ext) ||
                                  relName.startsWith('assets/') || relName.startsWith('res/')) {
                            content = await fs.readFile(fullPath, 'utf8');
                        } else {
                            continue;
                        }
                    } catch { continue; }

                    const lower = content.toLowerCase();

                    // Payment keywords
                    for (const { key, label } of PAYMENT_KEYWORDS) {
                        if (lower.includes(key)) {
                            const idx = lower.indexOf(key);
                            const lineStart = content.substring(0, idx).split('\n').length;
                            addToMap(paymentMap, label, baseName, { lineStart, lineEnd: lineStart });
                        }
                    }

                    // Payment confirmation
                    for (const { pattern, label } of PAYMENT_CONFIRM_PATTERNS) {
                        if (pattern.test(content)) {
                            addToMap(confirmMap, label, baseName, findMatchLine(content, pattern));
                        }
                    }

                    // Signing
                    for (const { pattern, label } of SIGNING_PATTERNS) {
                        if (pattern.test(content)) {
                            addToMap(signingMap, label, baseName, findMatchLine(content, pattern));
                        }
                    }

                    // License + Smali real code
                    for (const { pattern, label } of LICENSE_PATCH_PATTERNS) {
                        if (pattern.test(content)) {
                            const lineInfo = findMatchLine(content, pattern);
                            addToMap(licenseMap, label, baseName, lineInfo);

                            if (ext === '.smali') {
                                const method = extractSmaliMethod(content, lineInfo);
                                if (method) {
                                    if (!smaliMatches.has(label)) smaliMatches.set(label, []);
                                    smaliMatches.get(label).push({
                                        file: baseName,
                                        methodCode: method.code,
                                        startLine: method.startLine,
                                        endLine: method.endLine
                                    });
                                }
                            }
                        }
                    }

                    // URLs
                    const urlRegex = /https?:\/\/[^\s"'`<>\\)]{8,}/g;
                    for (const u of (content.match(urlRegex) || [])) {
                        const clean = u.replace(/[.,;:!?)]+$/, '');
                        if (!clean.includes('schemas.android.com') && !clean.includes('w3.org') && !clean.includes('example.com') && clean.length < 200) {
                            foundUrls.add(clean);
                        }
                    }

                    // Secrets
                    detectSecrets(content, baseName, secretsFound);

                    // Permissions
                    const permRegex = /android\.permission\.([A-Z_]+)/g;
                    let m;
                    while ((m = permRegex.exec(content)) !== null) {
                        if (!permissions.includes(m[1])) permissions.push(m[1]);
                    }

                    // Manifest metadata
                    if (baseName === 'AndroidManifest.xml') {
                        const verMatch = content.match(/versionName[=\s:]+["']?([\d.]+)/i);
                        if (verMatch) appVersion = verMatch[1];
                        const minMatch = content.match(/minSdkVersion[=\s:]+["']?(\d+)/i);
                        if (minMatch) minSdk = minMatch[1];
                        const targetMatch = content.match(/targetSdkVersion[=\s:]+["']?(\d+)/i);
                        if (targetMatch) targetSdk = targetMatch[1];
                    }
                }

                // ── BUILD REPORT ───────────────────────────────────────────
                const riskScore = calcRisk(paymentMap, permissions, secretsFound);
                const urlArray = Array.from(foundUrls);
                const paymentUrls = urlArray.filter(u => PAYMENT_KEYWORDS.some(k => u.toLowerCase().includes(k.key)));
                const otherUrls = urlArray.filter(u => !PAYMENT_KEYWORDS.some(k => u.toLowerCase().includes(k.key)));

                let r = `🕵️‍♂️ *RIPOTI YA UCHAMBUZI - 26-BOT*\n`;
                r += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                r += `📦 *Faili:* \`${fileName}\` (${fileSizeMB}MB)\n`;
                r += `🆔 *Package:* \`${packageName}\`\n`;
                if (appVersion) r += `📌 *Version:* \`${appVersion}\`\n`;
                if (minSdk) r += `📱 *Min SDK:* \`${minSdk}\` | *Target:* \`${targetSdk || '?'}\`\n`;
                r += `⚠️ *Risk Score:* ${riskScore.badge} (${riskScore.score}/10)\n\n`;

                // PAYMENT SYSTEMS
                r += `💰 *MIFUMO YA MALIPO (${paymentMap.size}):*\n`;
                if (paymentMap.size > 0) {
                    for (const [label, entries] of paymentMap.entries()) {
                        r += `  💳 *${label}*\n     📍 _${formatEntries(entries, 3)}_\n`;
                    }
                } else {
                    r += `  🍃 _Hakuna viashiria vya malipo._\n`;
                }

                // PAYMENT CONFIRMATION
                r += `\n✅ *MTIRIRIKO WA UTHIBITISHO WA MALIPO (${confirmMap.size}):*\n`;
                if (confirmMap.size > 0) {
                    for (const [label, entries] of confirmMap.entries()) {
                        r += `  🔔 *${label}*\n     _${formatEntries(entries, 2)}_\n`;
                    }
                } else {
                    r += `  🍃 _Hakuna mtiririko wa uthibitisho._\n`;
                }

                // SIGNING
                r += `\n🔏 *SIGNING & CRYPTO:*\n`;
                r += `  *Scheme:* \`${signingInfo.signatureScheme}\`\n`;
                signingInfo.certDetails.forEach(d => r += `  ${d}\n`);

                // LICENSE / PATCH + SMALI
                r += `\n🔓 *ULINZI WA MALIPO / PATCH DETECTION (${licenseMap.size}):*\n`;
                if (licenseMap.size === 0) {
                    r += `  🍃 _Hakuna license checks — app rahisi ku-patch._\n`;
                } else {
                    for (const [label, entries] of licenseMap.entries()) {
                        r += `  🔑 *${label}*\n     _${formatEntries(entries, 2)}_\n`;
                    }
                }

                r += `\n  *🛠️ Smali Code Halisi (Patch Ready):*\n`;
                if (smaliMatches.size > 0) {
                    for (const [label, matches] of smaliMatches.entries()) {
                        r += `\n**${label}**\n`;
                        matches.slice(0, 3).forEach(m => {
                            r += `📍 \`${m.file}\` (mst. ${m.startLine}-${m.endLine})\n`;
                            r += `\`\`\`smali\n${m.methodCode}\n\`\`\`\n`;
                        });
                    }
                } else {
                    r += `  Hakuna Smali method iliyopatikana.\n`;
                }

                r += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n✅ _Uchambuzi umekamilika!_`;

                await sock.sendMessage(chatJid, { text: r }, { quoted: msg });
            }
        } catch (error) {
            console.error('[chambua]', error);
            await sock.sendMessage(chatJid, { text: `❌ Hitilafu: ${error.message}` }, { quoted: msg });
        } finally {
            await fs.remove(apkPath).catch(() => {});
            await fs.remove(outputDir).catch(() => {});
        }
    }
};

export default cmd;