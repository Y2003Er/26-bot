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

function extractPackageFromManifest(buffer) {
    const strings = extractStringsFromBuffer(buffer, 5);
    for (const s of strings) {
        if (
            /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,6}$/.test(s) &&
            s.includes('.') &&
            !s.includes('android.permission') &&
            !s.includes('schemas.android') &&
            !s.includes('w3.org') &&
            s.split('.').length >= 2 &&
            s.length >= 5 &&
            s.length <= 60
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

// ─── MAIN COMMAND ─────────────────────────────────────────────────────────────

const cmd = {
    name: 'chambua',
    alias: ['apk', 'analyzeapk'],
    description: 'Uchambuzi wa kina wa APK — malipo, signing, secrets, permissions.',
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
                            content   = extractStringsFromBuffer(buf).join('\n'); // array → string

                        } else if (baseName === 'AndroidManifest.xml') {
                            const buf  = await fs.readFile(fullPath);
                            const text = buf.toString('utf8');
                            const isText = text.includes('<?xml') || text.includes('manifest');
                            content = isText ? text : readManifestStrings(buf); // readManifestStrings does array.join internally

                            // Package name extraction — split from metadata block below
                            if (packageName === 'Haijulikani') {
                                if (isText) {
                                    const pkgMatch = content.match(/package[=\s:]+["']?([a-z][a-z0-9_.]+)/i);
                                    if (pkgMatch) packageName = pkgMatch[1];
                                } else {
                                    const pkg = extractPackageFromManifest(buf);
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

                    // Manifest metadata (version/sdk only — package handled above)
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