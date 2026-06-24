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
    return results; // array
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
// Inasoma binary AndroidManifest.xml (AXML format) bila npm package yoyote ya nje.
// AXML structure: header → string pool → resource IDs → XML nodes
// String pool iko offset 0x08, kila string iko UTF-16LE au UTF-8 kulingana na flags.

function parseAxmlStringPool(buf) {
    // Magic check: AXML starts with 0x00080003
    if (buf.length < 8) return [];
    const magic = buf.readUInt32LE(0);
    if (magic !== 0x00080003) return []; // si AXML halisi

    const strPoolOffset = 8; // chunk header ya string pool inaanza hapa
    if (buf.length < strPoolOffset + 28) return [];

    // String pool chunk header (28 bytes):
    // [0] chunkType(4) [4] chunkSize(4) [8] stringCount(4) [12] styleCount(4)
    // [16] flags(4)    [20] stringsStart(4) [24] stylesStart(4)
    const chunkType    = buf.readUInt32LE(strPoolOffset);
    if (chunkType !== 0x001C0001) return []; // bukan string pool

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
                // UTF-8: [utf16len(1-2)] [utf8len(1-2)] [bytes...]
                let pos = absOff;
                // skip utf16 length (1 or 2 bytes)
                if (buf[pos] & 0x80) pos += 2; else pos += 1;
                // read utf8 length
                let utf8Len = buf[pos];
                if (utf8Len & 0x80) { utf8Len = ((utf8Len & 0x7F) << 8) | buf[pos + 1]; pos += 2; }
                else pos += 1;
                if (pos + utf8Len > buf.length) continue;
                strings.push(buf.slice(pos, pos + utf8Len).toString('utf8'));
            } else {
                // UTF-16LE: [charCount(2)] [chars * 2]
                if (absOff + 2 > buf.length) continue;
                let charCount = buf.readUInt16LE(absOff);
                if (charCount & 0x8000) {
                    // high-bit set: length spans 2 shorts
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
    // Jaribu AXML string pool kwanza
    const axmlStrings = parseAxmlStringPool(buf);
    if (axmlStrings.length > 0) {
        // "package" attribute value iko mara nyingi kwenye strings za kwanza
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
        // Fallback: chochote kinachofanana na package name kutoka pool
        for (const s of axmlStrings) {
            if (s && /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]+){1,6}$/.test(s) && s.includes('.')) {
                return s;
            }
        }
    }

    // Fallback ya mwisho: raw string scan (kwa AXML ambazo hazijafuata spec)
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

// ─── LICENSE / PATCH DETECTION PATTERNS ──────────────────────────────────────

const LICENSE_PATCH_PATTERNS = [
    // ── Boolean flags za premium/paid status ─────────────────────────────────
    { pattern: /isPremium|isPaid|isSubscribed|isPurchased/i,        label: 'Premium Status Flag' },
    { pattern: /hasPurchased|hasSubscription|hasPro|hasLicense/i,   label: 'Purchase State Flag' },
    { pattern: /isUnlocked|isActivated|isLicensed|isFull/i,         label: 'Unlock/License Flag' },
    { pattern: /premiumUser|proUser|paidUser|vipUser/i,              label: 'User Tier Variable' },

    // ── License validation logic ──────────────────────────────────────────────
    { pattern: /LicenseChecker|LicenseValidator|LicenseManager/i,   label: 'License Checker Class' },
    { pattern: /checkLicense|validateLicense|verifyLicense/i,        label: 'License Validation Method' },
    { pattern: /LICENSED|NOT_LICENSED|RETRY/i,                       label: 'Android LVL Response Codes' },
    { pattern: /com\.android\.vending\.licensing/i,                  label: 'Google Play License Verification Library (LVL)' },
    { pattern: /Policy\.LICENSED/i,                                  label: 'LVL Policy Check' },
    { pattern: /ServerManagedPolicy|StrictPolicy/i,                  label: 'LVL Policy Class' },
    { pattern: /AESObfuscator/i,                                     label: 'LVL AES Obfuscator (license key storage)' },

    // ── Server-side verification endpoints ───────────────────────────────────
    { pattern: /verif(y|ication)[_\s]?(token|key|code|purchase)/i,  label: 'Server Verification Call' },
    { pattern: /validatePurchase|verifyPurchase|verifyReceipt/i,     label: 'Purchase Verification' },
    { pattern: /\/api\/.*(licen|verif|subscri|premium|paid)/i,       label: 'License/Premium API Endpoint' },
    { pattern: /receipt[_\s]?validat/i,                              label: 'Receipt Validation' },
    { pattern: /purchaseToken/i,                                     label: 'Purchase Token (Play Billing)' },
    { pattern: /originalTransactionId/i,                             label: 'Original Transaction ID (iOS style)' },

    // ── Google Play Billing confirmation ─────────────────────────────────────
    { pattern: /acknowledgePurchase/i,                               label: 'Play Billing: acknowledgePurchase (CRITICAL)' },
    { pattern: /onPurchasesUpdated/i,                                label: 'Play Billing: onPurchasesUpdated' },
    { pattern: /BillingClient\.newBuilder/i,                         label: 'Play BillingClient Init' },
    { pattern: /launchBillingFlow/i,                                 label: 'Play: launchBillingFlow (payment trigger)' },
    { pattern: /queryPurchasesAsync|queryPurchaseHistoryAsync/i,     label: 'Play: Query Purchase History' },
    { pattern: /Purchase\.PurchaseState\.PURCHASED/i,                label: 'Play: PURCHASED state check' },

    // ── Activation codes / serial keys ───────────────────────────────────────
    { pattern: /activationCode|serialKey|licenseKey|productKey/i,    label: 'Activation/Serial Key' },
    { pattern: /activat(e|ion)[_\s]?(server|url|endpoint)/i,         label: 'Activation Server Call' },
    { pattern: /registerDevice|deviceRegistration/i,                 label: 'Device Registration' },

    // ── Trial / expiry logic ──────────────────────────────────────────────────
    { pattern: /trialExpir|trialEnd|trialPeriod|trialDays/i,         label: 'Trial Expiry Logic' },
    { pattern: /expiryDate|expirationDate|subscriptionEnd/i,         label: 'Subscription Expiry Date' },
    { pattern: /gracePeriod/i,                                       label: 'Grace Period Logic' },
    { pattern: /isExpired|hasExpired|checkExpiry/i,                  label: 'Expiry Check' },

    // ── Feature gating ────────────────────────────────────────────────────────
    { pattern: /featureFlag|featureGate|featureEnabled/i,            label: 'Feature Flag/Gate' },
    { pattern: /isFeatureAvailable|isFeatureEnabled/i,               label: 'Feature Availability Check' },
    { pattern: /premiumFeature|proFeature|paidFeature/i,             label: 'Premium Feature Gate' },
    { pattern: /unlockFeature|lockFeature/i,                         label: 'Feature Lock/Unlock' },

    // ── Anti-tamper / integrity checks ───────────────────────────────────────
    { pattern: /checkSignature|verifySignature|getSignature/i,       label: '⚠️ Signature Integrity Check' },
    { pattern: /PackageManager.*GET_SIGNATURES/i,                    label: '⚠️ APK Signature Verification' },
    { pattern: /SafetyNet|PlayIntegrity|attestation/i,               label: '⚠️ Google SafetyNet/Play Integrity' },
    { pattern: /isRooted|detectRoot|RootBeer/i,                      label: '⚠️ Root Detection' },
    { pattern: /isEmulator|detectEmulator/i,                         label: '⚠️ Emulator Detection' },
    { pattern: /tamper|integrity[_\s]?check/i,                       label: '⚠️ Tamper Detection' },
    { pattern: /CRC|checksum/i,                                      label: '⚠️ Checksum Verification' },

    // ── Obfuscation signs ─────────────────────────────────────────────────────
    { pattern: /proguard|r8|obfuscat/i,                              label: 'Code Obfuscation (ProGuard/R8)' },
];

// ─── MAIN COMMAND ─────────────────────────────────────────────────────────────

const cmd = {
    name: 'chambua',
    alias: ['apk', 'analyzeapk'],
    description: 'Uchambuzi wa kina wa APK — malipo, signing, secrets, permissions, license/patch detection.',
    category: 'tools',

    async execute(sock, msg, args) {
        const chatJid     = msg.key.remoteJid;
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        const quotedMsg   = contextInfo?.quotedMessage;
        const documentMessage =
            msg.message?.documentMessage || quotedMsg?.documentMessage;

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
                // ── 1. DOWNLOAD ──────────────────────────────────────────────
                const stream = await downloadContentFromMessage(documentMessage, 'document');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                await fs.writeFile(apkPath, buffer);

                // ── 2. EXTRACT ───────────────────────────────────────────────
                const zip = new AdmZip(apkPath);
                await fs.ensureDir(outputDir);
                zip.extractAllTo(outputDir, true);

                // ── 3. SIGNING INFO ──────────────────────────────────────────
                const signingInfo = await readApkSigningInfo(outputDir);

                // ── 4. COLLECT FILES ─────────────────────────────────────────
                const allFiles = await collectFiles(outputDir, 4);

                // ── 5. INIT ACCUMULATORS ─────────────────────────────────────
                const foundUrls    = new Set();
                const paymentMap   = new Map();
                const confirmMap   = new Map();
                const signingMap   = new Map();
                const licenseMap   = new Map(); // ← MPYA
                const secretsFound = [];
                const permissions  = [];
                let packageName    = 'Haijulikani';
                let appVersion     = '';
                let minSdk         = '';
                let targetSdk      = '';

                // ── 6. SCAN FILES ────────────────────────────────────────────
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
                            content   = extractStringsFromBuffer(buf).join('\n');

                        } else if (baseName === 'AndroidManifest.xml') {
                            const buf    = await fs.readFile(fullPath);
                            const text   = buf.toString('utf8');
                            const isText = text.includes('<?xml') || text.includes('manifest');
                            content = isText ? text : readManifestStrings(buf);

                            if (packageName === 'Haijulikani') {
                                if (isText) {
                                    const pkgMatch = content.match(/package[=\s:]+["']?([a-z][a-z0-9_.]+)/i);
                                    if (pkgMatch) packageName = pkgMatch[1];
                                } else {
                                    // Binary AXML — tumia AXML string pool decoder
                                    const pkg = extractPackageFromAxml(buf);
                                    if (pkg) packageName = pkg;
                                }
                            }

                        } else if (['.xml','.json','.js','.html','.txt','.properties','.yaml','.yml','.gradle'].includes(ext)) {
                            content = await fs.readFile(fullPath, 'utf8');

                        } else if (relName.startsWith('assets/') || relName.startsWith('res/')) {
                            try { content = await fs.readFile(fullPath, 'utf8'); } catch { continue; }

                        } else {
                            continue;
                        }
                    } catch { continue; }

                    const lower = content.toLowerCase();

                    // Payment keywords
                    for (const { key, label } of PAYMENT_KEYWORDS) {
                        if (lower.includes(key)) {
                            if (!paymentMap.has(label)) paymentMap.set(label, new Set());
                            paymentMap.get(label).add(baseName);
                        }
                    }

                    // Payment confirmation patterns
                    for (const { pattern, label } of PAYMENT_CONFIRM_PATTERNS) {
                        if (pattern.test(content)) {
                            if (!confirmMap.has(label)) confirmMap.set(label, new Set());
                            confirmMap.get(label).add(baseName);
                        }
                    }

                    // Signing patterns
                    for (const { pattern, label } of SIGNING_PATTERNS) {
                        if (pattern.test(content)) {
                            if (!signingMap.has(label)) signingMap.set(label, new Set());
                            signingMap.get(label).add(baseName);
                        }
                    }

                    // ── License / Patch detection ────────────────────────────
                    for (const { pattern, label } of LICENSE_PATCH_PATTERNS) {
                        if (pattern.test(content)) {
                            if (!licenseMap.has(label)) licenseMap.set(label, new Set());
                            licenseMap.get(label).add(baseName);
                        }
                    }

                    // URLs
                    const urlRegex = /https?:\/\/[^\s"'`<>\\)]{8,}/g;
                    for (const u of (content.match(urlRegex) || [])) {
                        const clean = u.replace(/[.,;:!?)]+$/, '');
                        if (
                            !clean.includes('schemas.android.com') &&
                            !clean.includes('w3.org') &&
                            !clean.includes('example.com') &&
                            clean.length < 200
                        ) {
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

                // ── 7. BUILD REPORT ───────────────────────────────────────────
                const riskScore   = calcRisk(paymentMap, permissions, secretsFound);
                const urlArray    = Array.from(foundUrls);
                const paymentUrls = urlArray.filter(u =>
                    PAYMENT_KEYWORDS.some(k => u.toLowerCase().includes(k.key))
                );
                const otherUrls = urlArray.filter(u =>
                    !PAYMENT_KEYWORDS.some(k => u.toLowerCase().includes(k.key))
                );

                let r = `🕵️‍♂️ *RIPOTI YA UCHAMBUZI - 26-BOT*\n`;
                r += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                r += `📦 *Faili:* \`${fileName}\` (${fileSizeMB}MB)\n`;
                r += `🆔 *Package:* \`${packageName}\`\n`;
                if (appVersion) r += `📌 *Version:* \`${appVersion}\`\n`;
                if (minSdk)     r += `📱 *Min SDK:* \`${minSdk}\` | *Target:* \`${targetSdk || '?'}\`\n`;
                r += `⚠️ *Risk Score:* ${riskScore.badge} (${riskScore.score}/10)\n\n`;

                // PAYMENT SYSTEMS
                r += `💰 *MIFUMO YA MALIPO (${paymentMap.size}):*\n`;
                if (paymentMap.size > 0) {
                    for (const [label, files] of paymentMap.entries()) {
                        r += `  💳 *${label}*\n     📍 _${Array.from(files).slice(0, 3).join(', ')}_\n`;
                    }
                } else {
                    r += `  🍃 _Hakuna viashiria vya malipo._\n`;
                }

                // PAYMENT CONFIRMATION
                r += `\n✅ *MTIRIRIKO WA UTHIBITISHO WA MALIPO (${confirmMap.size}):*\n`;
                if (confirmMap.size > 0) {
                    const all = [...confirmMap.entries()];
                    const isCallback = ([l]) => /callback|webhook|ipn|notify/i.test(l);
                    const isStatus   = ([l]) => /status|verif|confirm/i.test(l);
                    const isPlatform = ([l]) => /google play|stripe|m-pesa/i.test(l);

                    const callbackEntries = all.filter(isCallback);
                    const statusEntries   = all.filter(e => isStatus(e) && !isCallback(e));
                    const platformEntries = all.filter(e => isPlatform(e) && !isCallback(e) && !isStatus(e));
                    const otherConfirm    = all.filter(e => !isCallback(e) && !isStatus(e) && !isPlatform(e));

                    const printGroup = (title, entries) => {
                        if (entries.length === 0) return;
                        r += `  *${title}*\n`;
                        entries.forEach(([label, files]) => {
                            r += `    🔔 \`${label}\`\n       _${Array.from(files).slice(0, 2).join(', ')}_\n`;
                        });
                    };

                    printGroup('📡 Callbacks/Webhooks:', callbackEntries);
                    printGroup('🔍 Status/Verification:', statusEntries);
                    printGroup('📲 Platform-Specific:', platformEntries);
                    printGroup('📋 Nyingine:', otherConfirm);
                } else {
                    r += `  🍃 _Hakuna mtiririko wa uthibitisho uliopatikana._\n`;
                }

                // SIGNING
                r += `\n🔏 *AINA YA KUSAINI (SIGNING & CRYPTO):*\n`;
                r += `  *📜 APK Certificate:*\n`;
                r += `    🔐 Scheme: \`${signingInfo.signatureScheme}\`\n`;
                if (signingInfo.certDetails.length > 0) {
                    signingInfo.certDetails.forEach(d => r += `    📋 ${d}\n`);
                } else {
                    r += `    ⚠️ _Maelezo ya certificate hayakupatikana_\n`;
                }
                if (signingMap.size > 0) {
                    r += `  *🔑 Mbinu za Kusaini kwenye Kodi (${signingMap.size}):*\n`;
                    const priorityOrder = [
                        'HMAC-SHA Signature', 'RSA Encryption', 'AES Encryption',
                        'JWT Token', 'Bearer Token Auth',
                        'Certificate Pinning (OkHttp)', 'Stripe PaymentIntent',
                    ];
                    const sorted = [...signingMap.entries()].sort(([a], [b]) => {
                        const ai = priorityOrder.indexOf(a);
                        const bi = priorityOrder.indexOf(b);
                        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
                    });
                    sorted.slice(0, 8).forEach(([label, files]) => {
                        r += `    🔑 \`${label}\`\n       _${Array.from(files).slice(0, 2).join(', ')}_\n`;
                    });
                    if (signingMap.size > 8) r += `    _...na ${signingMap.size - 8} zaidi_\n`;
                }

                // SECRETS
                if (secretsFound.length > 0) {
                    r += `\n🚨 *SECRETS/API KEYS (${secretsFound.length}):*\n`;
                    secretsFound.slice(0, 5).forEach(s => {
                        r += `  🔑 \`${s.type}\` katika \`${s.file}\`\n     _${s.preview}_\n`;
                    });
                    if (secretsFound.length > 5) r += `  _...na ${secretsFound.length - 5} zaidi_\n`;
                }

                // PERMISSIONS
                const dangerousFound = permissions.filter(p => DANGEROUS_PERMS[p]);
                const safeFound      = permissions.filter(p => !DANGEROUS_PERMS[p]);
                r += `\n🛡️ *RUHUSA (${permissions.length} total):*\n`;
                if (dangerousFound.length > 0) {
                    r += `*Hatari:*\n`;
                    dangerousFound.forEach(p => r += `  ${DANGEROUS_PERMS[p]}: \`${p}\`\n`);
                }
                if (safeFound.length > 0) {
                    r += `*Kawaida:* ${safeFound.slice(0, 5).map(p => `\`${p}\``).join(', ')}`;
                    if (safeFound.length > 5) r += ` _+${safeFound.length - 5} zaidi_`;
                    r += '\n';
                }
                if (permissions.length === 0) r += `  🍃 _Hakuna ruhusa zilizopatikana._\n`;

                // URLS
                r += `\n🔗 *VIUNGO (${foundUrls.size} total):*\n`;
                if (paymentUrls.length > 0) {
                    r += `*Viungo vya Malipo:*\n`;
                    paymentUrls.slice(0, 4).forEach(u => r += `  🎯 ${u}\n`);
                }
                if (otherUrls.length > 0) {
                    r += `*Vingine:*\n`;
                    otherUrls.slice(0, 4).forEach(u => r += `  📌 ${u}\n`);
                    if (otherUrls.length > 4) r += `  _...na ${otherUrls.length - 4} zaidi_\n`;
                }
                if (foundUrls.size === 0) r += `  🍃 _Hakuna URLs._\n`;

                // ── LICENSE / PATCH DETECTION ────────────────────────────────
                const antiTamper    = [...licenseMap.entries()].filter(([l]) => l.includes('⚠️'));
                const licenseChecks = [...licenseMap.entries()].filter(([l]) =>
                    /license|lvl|verif|receipt|purchaseToken/i.test(l) && !l.includes('⚠️')
                );
                const playBilling   = [...licenseMap.entries()].filter(([l]) =>
                    /play billing|play:/i.test(l) && !l.includes('⚠️')
                );
                // FIX: exclude labels already captured by licenseChecks/playBilling
                const featureGates  = [...licenseMap.entries()].filter(([l]) =>
                    /premium|feature|flag|gate|trial|expir|unlock/i.test(l) &&
                    !l.includes('⚠️') &&
                    !licenseChecks.some(([ll]) => ll === l) &&
                    !playBilling.some(([ll]) => ll === l)
                );
                const otherLicense  = [...licenseMap.entries()].filter(([l]) =>
                    !antiTamper.some(([ll]) => ll === l) &&
                    !licenseChecks.some(([ll]) => ll === l) &&
                    !featureGates.some(([ll]) => ll === l) &&
                    !playBilling.some(([ll]) => ll === l)
                );

                r += `\n🔓 *ULINZI WA MALIPO / PATCH DETECTION (${licenseMap.size}):*\n`;

                if (licenseMap.size === 0) {
                    r += `  🍃 _Hakuna license checks zilizopatikana — app inaweza kuwa rahisi ku-patch._\n`;
                } else {
                    if (antiTamper.length > 0) {
                        r += `  *🛡️ Anti-Tamper / Integrity:*\n`;
                        antiTamper.forEach(([label, files]) => {
                            r += `    ${label}\n       _${Array.from(files).slice(0, 2).join(', ')}_\n`;
                        });
                    }
                    if (licenseChecks.length > 0) {
                        r += `  *🔑 License Verification:*\n`;
                        licenseChecks.forEach(([label, files]) => {
                            r += `    🔑 \`${label}\`\n       _${Array.from(files).slice(0, 2).join(', ')}_\n`;
                        });
                    }
                    if (playBilling.length > 0) {
                        r += `  *🏪 Google Play Billing:*\n`;
                        playBilling.forEach(([label, files]) => {
                            r += `    🏪 \`${label}\`\n       _${Array.from(files).slice(0, 2).join(', ')}_\n`;
                        });
                    }
                    if (featureGates.length > 0) {
                        r += `  *🚪 Feature Gates / Trial Logic:*\n`;
                        featureGates.forEach(([label, files]) => {
                            r += `    🚪 \`${label}\`\n       _${Array.from(files).slice(0, 2).join(', ')}_\n`;
                        });
                    }
                    if (otherLicense.length > 0) {
                        r += `  *📋 Nyingine:*\n`;
                        otherLicense.forEach(([label, files]) => {
                            r += `    📋 \`${label}\`\n       _${Array.from(files).slice(0, 2).join(', ')}_\n`;
                        });
                    }

                    // ── PATCH DIFFICULTY ─────────────────────────────────────
                    const hasAntiTamper    = antiTamper.length > 0;
                    const hasServerVerif   = licenseChecks.some(([l]) => /server|receipt|token/i.test(l));
                    const hasPlayIntegrity = antiTamper.some(([l]) => /safetynet|integrity|attestation/i.test(l));
                    const hasRootDetect    = antiTamper.some(([l]) => /root/i.test(l));
                    const hasSignCheck     = antiTamper.some(([l]) => /signature/i.test(l));
                    const hasChecksum      = antiTamper.some(([l]) => /checksum|crc/i.test(l));

                    let patchDifficulty, patchEmoji;
                    if (hasPlayIntegrity && hasServerVerif) {
                        patchDifficulty = 'Ngumu Sana — Server + Play Integrity inahitajika kupita';
                        patchEmoji = '🔴';
                    } else if (hasServerVerif) {
                        patchDifficulty = 'Ngumu — Verification server-side, patch ya local haitoshi';
                        patchEmoji = '🟠';
                    } else if (hasAntiTamper) {
                        patchDifficulty = 'Wastani — Anti-tamper ipo, inaweza kupita kwa smali/frida';
                        patchEmoji = '🟡';
                    } else {
                        patchDifficulty = 'Rahisi — Hakuna server verification wala anti-tamper';
                        patchEmoji = '🟢';
                    }

                    r += `\n  *🎯 Ugumu wa Ku-Patch:* ${patchEmoji} ${patchDifficulty}\n`;

                    // ── SMALI PATCH GUIDE (na code halisi) ──────────────────
                    r += `\n  *🛠️ Smali Patch Guide — Code Halisi:*\n`;

                    // ① Boolean flags (isPremium / isPaid / isUnlocked)
                    const flagMatches = [...licenseMap.entries()].filter(([l]) =>
                        /premium status|purchase state|unlock.*flag|user tier/i.test(l)
                    );
                    if (flagMatches.length > 0) {
                        const files = [...new Set(flagMatches.flatMap(([,f]) => [...f]))].slice(0, 2).join(', ');
                        r += `\n  ① *Boolean Flag Patch* (_${files}_)\n`;
                        r += `  _Tafuta method: \`isPremium\`, \`isPaid\`, \`isUnlocked\` n.k._\n`;
                        r += `  _KABLA ya patch (original):_\n`;
                        r += `  \`.method public isPremium()Z\`\n`;
                        r += `  \`    const/4 v0, 0x0\`\n`;
                        r += `  \`    return v0\`\n`;
                        r += `  \`.end method\`\n`;
                        r += `  _BAADA ya patch:_\n`;
                        r += `  \`.method public isPremium()Z\`\n`;
                        r += `  \`    const/4 v0, 0x1\`\n`;
                        r += `  \`    return v0\`\n`;
                        r += `  \`.end method\`\n`;
                        r += `  _(Z = boolean; 0x0=false, 0x1=true)_\n`;
                    }

                    // ② LVL License Checker
                    const lvlMatches = [...licenseMap.entries()].filter(([l]) =>
                        /license checker|license validation|lvl policy|lvl response/i.test(l)
                    );
                    if (lvlMatches.length > 0) {
                        const files = [...new Set(lvlMatches.flatMap(([,f]) => [...f]))].slice(0, 2).join(', ');
                        r += `\n  ② *LVL License Checker Patch* (_${files}_)\n`;
                        r += `  _Tafuta class: \`LicenseChecker\`, method: \`allow(I)V\`_\n`;
                        r += `  _KABLA:_\n`;
                        r += `  \`.method public allow(I)V\`\n`;
                        r += `  \`    if-eq p1, 0x100, :licensed\`\n`;
                        r += `  \`    invoke-virtual {p0}, L...;->dontAllow()V\`\n`;
                        r += `  \`    return-void\`\n`;
                        r += `  \`    :licensed\`\n`;
                        r += `  \`    invoke-virtual {p0}, L...;->allow()V\`\n`;
                        r += `  \`    return-void\`\n`;
                        r += `  \`.end method\`\n`;
                        r += `  _BAADA (skip check, daima licensed):_\n`;
                        r += `  \`.method public allow(I)V\`\n`;
                        r += `  \`    invoke-virtual {p0}, L...;->allow()V\`\n`;
                        r += `  \`    return-void\`\n`;
                        r += `  \`.end method\`\n`;
                    }

                    // ③ Play Billing purchase state
                    if (playBilling.length > 0) {
                        const files = [...new Set(playBilling.flatMap(([,f]) => [...f]))].slice(0, 2).join(', ');
                        r += `\n  ③ *Play Billing Patch* (_${files}_)\n`;
                        r += `  _Tafuta: \`onPurchasesUpdated\` au \`getPurchaseState\`_\n`;
                        r += `  _KABLA (inacheck kama 1 = PURCHASED):_\n`;
                        r += `  \`    invoke-interface {v1}, Lcom/android/billingclient/...;->getPurchaseState()I\`\n`;
                        r += `  \`    move-result v2\`\n`;
                        r += `  \`    const/4 v3, 0x1\`\n`;
                        r += `  \`    if-ne v2, v3, :not_purchased\`\n`;
                        r += `  \`    ... # grant access\`\n`;
                        r += `  \`    :not_purchased\`\n`;
                        r += `  \`    return-void\`\n`;
                        r += `  _BAADA (badilisha if-ne → if-eq, skip :not_purchased):_\n`;
                        r += `  \`    if-eq v2, v3, :not_purchased\`\n`;
                        r += `  _(au futa \`if-ne\` line kabisa)_\n`;
                    }

                    // ④ Feature gate
                    if (featureGates.length > 0) {
                        const files = [...new Set(featureGates.flatMap(([,f]) => [...f]))].slice(0, 2).join(', ');
                        r += `\n  ④ *Feature Gate Patch* (_${files}_)\n`;
                        r += `  _Tafuta: \`isFeatureEnabled\`, \`premiumFeature\`, \`isUnlocked\`_\n`;
                        r += `  _KABLA:_\n`;
                        r += `  \`.method public isFeatureEnabled(Ljava/lang/String;)Z\`\n`;
                        r += `  \`    ... # logic ngumu\`\n`;
                        r += `  \`    return v0\`\n`;
                        r += `  \`.end method\`\n`;
                        r += `  _BAADA (futa logic yote, rudisha true):_\n`;
                        r += `  \`.method public isFeatureEnabled(Ljava/lang/String;)Z\`\n`;
                        r += `  \`    const/4 v0, 0x1\`\n`;
                        r += `  \`    return v0\`\n`;
                        r += `  \`.end method\`\n`;
                    }

                    // ⑤ Trial/expiry
                    const expiryMatches = [...licenseMap.entries()].filter(([l]) =>
                        /expir|trial|grace/i.test(l)
                    );
                    if (expiryMatches.length > 0) {
                        const files = [...new Set(expiryMatches.flatMap(([,f]) => [...f]))].slice(0, 2).join(', ');
                        r += `\n  ⑤ *Trial / Expiry Patch* (_${files}_)\n`;
                        r += `  _Tafuta: \`isExpired\`, \`checkExpiry\`, \`trialEnd\`_\n`;
                        r += `  _KABLA:_\n`;
                        r += `  \`.method public isExpired()Z\`\n`;
                        r += `  \`    invoke-static {}, Ljava/lang/System;->currentTimeMillis()J\`\n`;
                        r += `  \`    ... # comparison na expiry date\`\n`;
                        r += `  \`    return v0\`\n`;
                        r += `  \`.end method\`\n`;
                        r += `  _BAADA (daima "hajakwisha"):_\n`;
                        r += `  \`.method public isExpired()Z\`\n`;
                        r += `  \`    const/4 v0, 0x0\`\n`;
                        r += `  \`    return v0\`\n`;
                        r += `  \`.end method\`\n`;
                    }

                    // ⑥ Anti-tamper — signature check
                    if (hasSignCheck) {
                        r += `\n  ⑥ *⚠️ Signature Check — Lazima Disable Kwanza!*\n`;
                        r += `  _Tafuta: \`getSignature\`, \`GET_SIGNATURES\`, \`checkSignature\`_\n`;
                        r += `  _KABLA (inacompare hash ya signature):_\n`;
                        r += `  \`    invoke-virtual {v1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z\`\n`;
                        r += `  \`    move-result v2\`\n`;
                        r += `  \`    if-eqz v2, :sig_mismatch\`\n`;
                        r += `  \`    # app inaendelea\`\n`;
                        r += `  \`    :sig_mismatch\`\n`;
                        r += `  \`    invoke-static {}, L...;->exit()V  # crash/exit\`\n`;
                        r += `  _BAADA (futa sig_mismatch jump — daima endelea):_\n`;
                        r += `  \`    # futa line: if-eqz v2, :sig_mismatch\`\n`;
                        r += `  \`    # futa block yote ya :sig_mismatch\`\n`;
                    }

                    // ⑦ Root detection
                    if (hasRootDetect) {
                        r += `\n  ⑦ *⚠️ Root Detection Patch*\n`;
                        r += `  _Tafuta: \`isRooted\`, \`detectRoot\`, \`RootBeer\`_\n`;
                        r += `  _KABLA:_\n`;
                        r += `  \`.method public isRooted()Z\`\n`;
                        r += `  \`    ... # checks nyingi za root\`\n`;
                        r += `  \`    return v0\`\n`;
                        r += `  \`.end method\`\n`;
                        r += `  _BAADA (daima "si-rooted"):_\n`;
                        r += `  \`.method public isRooted()Z\`\n`;
                        r += `  \`    const/4 v0, 0x0\`\n`;
                        r += `  \`    return v0\`\n`;
                        r += `  \`.end method\`\n`;
                    }

                    // ⑧ Checksum
                    if (hasChecksum) {
                        r += `\n  ⑧ *⚠️ Checksum / CRC Patch*\n`;
                        r += `  _Tafuta method inayotumia \`CRC32\` au \`MessageDigest\`_\n`;
                        r += `  _KABLA (inacompare checksum zilizo-hardcoded):_\n`;
                        r += `  \`    invoke-virtual {v1, v2}, Ljava/lang/Long;->equals(...)Z\`\n`;
                        r += `  \`    move-result v3\`\n`;
                        r += `  \`    if-eqz v3, :checksum_fail\`\n`;
                        r += `  _BAADA (flip: if-eqz → if-nez, au futa jump):_\n`;
                        r += `  \`    if-nez v3, :checksum_fail\`\n`;
                        r += `  _(au futa line ya if-eqz kabisa)_\n`;
                    }

                    // ⑨ Play Integrity / SafetyNet
                    if (hasPlayIntegrity) {
                        r += `\n  ⑨ *⚠️ Play Integrity / SafetyNet — Ngumu Sana!*\n`;
                        r += `  _Smali patch peke yake haitoshi — server inaithibitisha_\n`;
                        r += `  _Frida script (hook requestIntegrityToken):_\n`;
                        r += `  \`Java.perform(function() {\`\n`;
                        r += `  \`  var IntMgr = Java.use(\`\n`;
                        r += `  \`    "com.google.android.play.core.integrity.IntegrityManager");\`\n`;
                        r += `  \`  IntMgr.requestIntegrityToken.overload(\`\n`;
                        r += `  \`    "com.google.android.play.core.integrity.IntegrityTokenRequest")\`\n`;
                        r += `  \`  .implementation = function(req) {\`\n`;
                        r += `  \`    return this.requestIntegrityToken(req); // intercept\`\n`;
                        r += `  \`  };\`\n`;
                        r += `  \`});\`\n`;
                        r += `  _AU tumia: LSPosed module "PlayIntegrityFix" (bila Frida)_\n`;
                    }

                    // Tools
                    r += `\n  *🔧 Zana Zinazoshauriwa:*\n`;
                    r += `    • *APKTool* — \`apktool d app.apk\` kisha \`apktool b out/ -o patched.apk\`\n`;
                    r += `    • *MT Manager / NP Manager* — Smali editor moja kwa moja Android\n`;
                    r += `    • *jadx-gui* — Soma Java kwanza uelewe structure ya class\n`;
                    r += `    • *zipalign + apksigner* — Sign APK baada ya patch\n`;
                    if (hasPlayIntegrity || hasServerVerif) {
                        r += `    • *Frida* — \`frida -U -f com.pkg.name -l hook.js\`\n`;
                        r += `    • *LSPosed + PlayIntegrityFix* — Rahisi kuliko Frida\n`;
                    }
                }

                r += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n✅ _Uchambuzi umekamilika!_`;

                await sock.sendMessage(chatJid, { text: r }, { quoted: msg });
            }

        } catch (error) {
            console.error('[chambua]', error);
            await sock.sendMessage(chatJid, {
                text: `❌ Hitilafu: ${error.message}`
            }, { quoted: msg });
        } finally {
            await fs.remove(apkPath).catch(() => {});
            await fs.remove(outputDir).catch(() => {});
        }
    }
};

export default cmd;
