import fs from 'fs-extra';
import AdmZip from 'adm-zip';
import path from 'path';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';

// ─── DEX STRING EXTRACTOR ─────────────────────────────────────────────────────
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
    return results.join('\n');
}

// ─── TIMEOUT WRAPPER ──────────────────────────────────────────────────────────
function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout baada ya ${ms / 1000}s`)), ms))
    ]);
}

const MAX_APK_MB = 80;
const MAX_FILE_READ_MB = 15;

const PAYMENT_KEYWORDS = [
    { key: 'mpesa', label: 'M-Pesa (Safaricom/Vodacom)', risk: 'high' },
    { key: 'tigopesa', label: 'Tigo Pesa', risk: 'high' },
    { key: 'airtelmoney', label: 'Airtel Money', risk: 'high' },
    { key: 'halopesa', label: 'HaloPesa', risk: 'high' },
    { key: 'azampay', label: 'AzamPay', risk: 'high' },
    { key: 'selcom', label: 'Selcom', risk: 'high' },
    { key: 'pesalink', label: 'PesaLink', risk: 'high' },
    { key: 'nmbbank', label: 'NMB Bank', risk: 'medium' },
    { key: 'crdbbank', label: 'CRDB Bank', risk: 'medium' },
    { key: 'stripe', label: 'Stripe', risk: 'medium' },
    { key: 'paypal', label: 'PayPal', risk: 'medium' },
    { key: 'flutterwave', label: 'Flutterwave', risk: 'medium' },
    { key: 'paystack', label: 'Paystack', risk: 'medium' },
    { key: 'razorpay', label: 'Razorpay', risk: 'medium' },
    { key: 'braintree', label: 'Braintree', risk: 'medium' },
    { key: 'checkout', label: 'Checkout Flow', risk: 'low' },
    { key: 'billing', label: 'Billing System', risk: 'low' },
    { key: 'payment', label: 'Payment Generic', risk: 'low' },
    { key: 'transaction', label: 'Transaction', risk: 'low' },
    { key: 'wallet', label: 'Wallet', risk: 'low' },
    { key: 'subscribe', label: 'Subscription', risk: 'low' },
];

const DANGEROUS_PERMS = {
    READ_SMS: '🔴 Inasoma SMS (M-Pesa codes!)',
    RECEIVE_SMS: '🔴 Inakabidhi SMS',
    RECORD_AUDIO: '🔴 Inaweza kurekodi sauti',
    CAMERA: '🟠 Inatumia kamera',
    ACCESS_FINE_LOCATION: '🟠 GPS halisi',
    ACCESS_COARSE_LOCATION: '🟡 Mahali takriban',
    READ_CONTACTS: '🟠 Inasoma contacts',
    READ_CALL_LOG: '🔴 Inasoma call log',
    PROCESS_OUTGOING_CALLS: '🔴 Inadhibiti simu',
    READ_PHONE_STATE: '🟡 Inasoma IMEI/SIM',
    SEND_SMS: '🔴 Inatuma SMS',
    INSTALL_PACKAGES: '🔴 Inaweza kufunga apps',
    REQUEST_INSTALL_PACKAGES: '🔴 Inaomba kufunga apps',
    DISABLE_KEYGUARD: '🔴 Inazima lock screen',
    SYSTEM_ALERT_WINDOW: '🟠 Overlay juu ya apps',
    RECEIVE_BOOT_COMPLETED: '🟡 Inaanza na boot',
    FOREGROUND_SERVICE: '🟡 Inaendesha background',
};

const PAYMENT_CONFIRM_PATTERNS = [
    { pattern: /payment[_\s]?callback/i,          label: 'Payment Callback URL/Method' },
    { pattern: /webhook/i,                          label: 'Webhook Handler' },
    { pattern: /ipn/i,                              label: 'IPN (Instant Payment Notification)' },
    { pattern: /notify[_\s]?url/i,                  label: 'Notify URL (callback endpoint)' },
    { pattern: /callback[_\s]?url/i,                label: 'Callback URL' },
    { pattern: /payment[_\s]?status/i,              label: 'Payment Status Check' },
    { pattern: /transaction[_\s]?status/i,          label: 'Transaction Status Check' },
    { pattern: /order[_\s]?status/i,                label: 'Order Status Check' },
    { pattern: /verif(y|ication)[_\s]?payment/i,   label: 'Payment Verification' },
    { pattern: /confirm[_\s]?payment/i,             label: 'Payment Confirmation' },
    { pattern: /ResultCode/i,                       label: 'ResultCode (M-Pesa style response)' },
    { pattern: /ResponseCode/i,                     label: 'ResponseCode handler' },
    { pattern: /CheckoutRequestID/i,                label: 'CheckoutRequestID (M-Pesa STK Push)' },
    { pattern: /MerchantRequestID/i,                label: 'MerchantRequestID (M-Pesa)' },
    { pattern: /transactionId/i,                    label: 'Transaction ID handler' },
    { pattern: /receiptNumber/i,                    label: 'Receipt Number (M-Pesa)' },
    { pattern: /payment[_\s]?success/i,             label: 'Payment Success Handler' },
    { pattern: /payment[_\s]?(fail|error|decline)/i,label: 'Payment Failure Handler' },
    { pattern: /BillingResult/i,                    label: 'Google Play BillingResult' },
    { pattern: /PurchasesUpdatedListener/i,         label: 'Google Play PurchasesUpdatedListener' },
    { pattern: /acknowledgePurchase/i,              label: 'Google Play acknowledgePurchase (confirm)' },
    { pattern: /PaymentIntent/i,                    label: 'Stripe PaymentIntent' },
    { pattern: /confirmPayment/i,                   label: 'Stripe confirmPayment' },
];

const SIGNING_PATTERNS = [
    { pattern: /HmacSHA(256|512|1)/i,    label: 'HMAC-SHA Signature' },
    { pattern: /SHA-?(256|512|1)/i,       label: 'SHA Hash' },
    { pattern: /MD5/i,                    label: 'MD5 Hash' },
    { pattern: /RSA/i,                    label: 'RSA Encryption' },
    { pattern: /AES/i,                    label: 'AES Encryption' },
    { pattern: /Base64/i,                 label: 'Base64 Encoding' },
    { pattern: /JsonWebToken|JWT/i,       label: 'JWT Token' },
    { pattern: /CertificatePinner/i,      label: 'Certificate Pinning (OkHttp)' },
    { pattern: /Interceptor/i,            label: 'HTTP Interceptor (request signing)' },
    { pattern: /addHeader.*Authorization/i,label: 'Authorization Header injection' },
];

// ─── META-INF CERTIFICATE READER ─────────────────────────────────────────────
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
                const strings = extractStringsFromBuffer(buf, 4);
                const cnMatch = strings.match(/CN=([^\n,]+)/);
                const oMatch = strings.match(/\bO=([^\n,]+)/);
                const cMatch = strings.match(/\bC=([A-Z]{2})/);
                if (cnMatch) info.certDetails.push(`CN: ${cnMatch[1].trim()}`);
                if (oMatch)  info.certDetails.push(`Org: ${oMatch[1].trim()}`);
                if (cMatch)  info.certDetails.push(`Country: ${cMatch[1].trim()}`);
            }
            if (upper.endsWith('.SF')) info.signerFiles.push(entry);
        }
        if (info.signerFiles.length === 0) {
            info.signatureScheme = 'V2/V3 (APK Signing Block)';
        } else {
            info.signatureScheme = `V1 (JAR) — [${info.signerFiles.join(', ')}]`;
        }
    } catch {
        info.signatureScheme = 'Haijulikani (META-INF haipo)';
    }
    return info;
}

const SECRET_PATTERNS = [
    { type: 'Firebase API Key',   regex: /AIza[0-9A-Za-z\-_]{35}/ },
    { type: 'Google OAuth',        regex: /[0-9]+-[0-9A-Za-z_]{32}\.apps\.googleusercontent\.com/ },
    { type: 'AWS Key',             regex: /AKIA[0-9A-Z]{16}/ },
    { type: 'Stripe Secret Key',   regex: /sk_(live|test)_[0-9a-zA-Z]{24,}/ },
    { type: 'Private Key Header',  regex: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/ },
];

function detectSecrets(content, fileName, results) {
    for (const { type, regex } of SECRET_PATTERNS) {
        const match = content.match(regex);
        if (match) {
            const preview = match[0].substring(0, 30) + '...';
            if (!results.some(r => r.type === type && r.file === fileName)) {
                results.push({ type, file: fileName, preview });
            }
        }
    }
}

function calcRisk(paymentMap, permissions, secrets) {
    let score = 0;
    score += Math.min(paymentMap.size * 0.5, 3);
    const dangerPerms = permissions.filter(p => DANGEROUS_PERMS[p]).length;
    score += Math.min(dangerPerms * 0.8, 4);
    score += Math.min(secrets.length * 1.5, 3);
    score = Math.min(Math.round(score), 10);
    let badge = score <= 2 ? '🟢 Chini' : score <= 5 ? '🟡 Wastani' : score <= 7 ? '🟠 Juu' : '🔴 Hatari Sana';
    return { score, badge };
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

const cmd = {
    name: 'chambua',
    alias: ['apk', 'analyzeapk'],
    description: 'Uchambuzi wa juu wa mifumo ya malipo na usalama kwenye APK.',
    category: 'tools',

    async execute(sock, msg, args) {
        const chatJid = msg.key.remoteJid;
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        const quotedMsg = contextInfo?.quotedMessage;
        const documentMessage = msg.message?.documentMessage || quotedMsg?.documentMessage;

        if (!documentMessage) {
            return await sock.sendMessage(chatJid, { text: '❌ Reply kwenye faili la APK kisha andika amri hii.' }, { quoted: msg });
        }

        const mime = documentMessage.mimetype || '';
        const fileName = documentMessage.fileName || 'unknown.apk';
        const fileSize = documentMessage.fileLength || 0;
        const fileSizeMB = (fileSize / 1024 / 1024).toFixed(1);

        if (!mime.includes('android') && !fileName.toLowerCase().endsWith('.apk')) {
            return await sock.sendMessage(chatJid, { text: '❌ Faili hili halionekani kuwa APK ya Android.' }, { quoted: msg });
        }

        if (fileSize > MAX_APK_MB * 1024 * 1024) {
            return await sock.sendMessage(chatJid, { text: `❌ APK ni kubwa mno (${fileSizeMB}MB). Max ni ${MAX_APK_MB}MB.` }, { quoted: msg });
        }

        await sock.sendMessage(chatJid, { text: `🕵️‍♂️ *Inaanza Uchambuzi wa Kina...*\n📦 Faili: \`${fileName}\`\n_Subiri kidogo..._` }, { quoted: msg });

        const timestamp = Date.now();
        const apkPath = path.join(process.cwd(), `temp_apk_${timestamp}.apk`);
        const outputDir = path.join(process.cwd(), `extracted_apk_${timestamp}`);

        try {
            await withTimeout(runAnalysis(), 120_000);

            async function runAnalysis() {
                const stream = await downloadContentFromMessage(documentMessage, 'document');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                await fs.writeFile(apkPath, buffer);

                const zip = new AdmZip(apkPath);
                await fs.ensureDir(outputDir);
                zip.extractAllTo(outputDir, true);

                const signingInfo = await readApkSigningInfo(outputDir);
                const allFiles = await collectFiles(outputDir, 4);

                const foundUrls = new Set();
                const paymentMap = new Map();
                const confirmMap = new Map();
                const signingMap = new Map();
                const secretsFound = [];
                const permissions = [];
                let packageName = 'Haijulikani';
                let appVersion = '';

                for (const fullPath of allFiles) {
                    const baseName = path.basename(fullPath);
                    const ext = path.extname(fullPath).toLowerCase();
                    const fileStat = await fs.stat(fullPath);

                    if (fileStat.size > MAX_FILE_READ_MB * 1024 * 1024) continue;

                    let content = '';

                    try {
                        if (ext === '.dex') {
                            const buf = await fs.readFile(fullPath);
                            // USAHIHISHO: Inavuta string moja kwa moja tangu kule juu
                            content = extractStringsFromBuffer(buf); 
                        } else if (baseName === 'AndroidManifest.xml') {
                            const buf = await fs.readFile(fullPath);
                            const text = buf.toString('utf8');
                            content = (text.includes('<?xml') || text.includes('manifest')) ? text : extractStringsFromBuffer(buf, 4);
                        } else if (['.xml','.json','.js','.html','.txt'].includes(ext)) {
                            content = await fs.readFile(fullPath, 'utf8');
                        } else {
                            continue;
                        }
                    } catch { continue; }

                    const lower = content.toLowerCase();

                    // Keywords za malipo
                    for (const { key, label } of PAYMENT_KEYWORDS) {
                        if (lower.includes(key)) {
                            if (!paymentMap.has(label)) paymentMap.set(label, new Set());
                            paymentMap.get(label).add(baseName);
                        }
                    }

                    // Uthibitisho wa malipo
                    for (const { pattern, label } of PAYMENT_CONFIRM_PATTERNS) {
                        if (pattern.test(content)) {
                            if (!confirmMap.has(label)) confirmMap.set(label, new Set());
                            confirmMap.get(label).add(baseName);
                        }
                    }

                    // Signing logic
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
                        if (!clean.includes('schemas.android.com') && !clean.includes('w3.org') && clean.length < 200) {
                            foundUrls.add(clean);
                        }
                    }

                    // Secrets & Permissions
                    detectSecrets(content, baseName, secretsFound);
                    const permRegex = /android\.permission\.([A-Z_]+)/g;
                    let m;
                    while ((m = permRegex.exec(content)) !== null) {
                        if (!permissions.includes(m[1])) permissions.push(m[1]);
                    }

                    if (baseName === 'AndroidManifest.xml') {
                        const pkgMatch = content.match(/package[=\s:]+["']?([a-z][a-z0-9_.]+)/i);
                        if (pkgMatch) packageName = pkgMatch[1];
                        const verMatch = content.match(/versionName[=\s:]+["']?([\d.]+)/i);
                        if (verMatch) appVersion = verMatch[1];
                    }
                }

                // KUANDAA RIPOTI
                const riskScore = calcRisk(paymentMap, permissions, secretsFound);
                let r = `🕵️‍♂️ *RIPOTI YA UCHAMBUZI - 26-BOT*\n`;
                r += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                r += `📦 *Faili:* \`${fileName}\` (${fileSizeMB}MB)\n`;
                r += `🆔 *Package:* \`${packageName}\`\n`;
                if (appVersion) r += `📌 *Version:* \`${appVersion}\`\n`;
                r += `⚠️ *Risk Score:* ${riskScore.badge} (${riskScore.score}/10)\n\n`;

                r += `💰 *MIFUMO YA MALIPO (${paymentMap.size}):*\n`;
                if (paymentMap.size > 0) {
                    for (const [label, files] of paymentMap.entries()) {
                        r += `  💳 *${label}*\n     📍 _${Array.from(files).slice(0, 2).join(', ')}_\n`;
                    }
                } else { r += `  🍃 _Hakuna viashiria vya malipo._\n`; }

                r += `\n✅ *UTHIBITISHO WA MALIPO (${confirmMap.size}):*\n`;
                if (confirmMap.size > 0) {
                    for (const [label, files] of confirmMap.entries()) {
                        r += `  🔔 \`${label}\` -> [_${Array.from(files).slice(0, 1).join('')}_]\n`;
                    }
                } else { r += `  🍃 _Hakuna mtiririko uliopatikana._\n`; }

                r += `\n🔏 *APK CERTIFICATE & CRYPTO:*\n`;
                r += `  🔐 Scheme: \`${signingInfo.signatureScheme}\`\n`;
                if (signingInfo.certDetails.length > 0) r += `    📋 ${signingInfo.certDetails.join(' | ')}\n`;
                
                if (signingMap.size > 0) {
                    r += `  *Mbinu za Kusaini (${signingMap.size}):*\n`;
                    [...signingMap.entries()].slice(0, 5).forEach(([label, files]) => {
                        r += `    🔑 \`${label}\` (_${Array.from(files).slice(0, 1).join('')}_)\n`;
                    });
                }

                if (secretsFound.length > 0) {
                    r += `\n🚨 *SECRETS/API KEYS ZILIZOVUJA (${secretsFound.length}):*\n`;
                    secretsFound.slice(0, 3).forEach(s => r += `  ⚠️ \`${s.type}\` katika \`${s.file}\`\n`);
                }

                const dangerousFound = permissions.filter(p => DANGEROUS_PERMS[p]);
                r += `\n🛡️ *RUHUSA HATARI (${dangerousFound.length}):*\n`;
                dangerousFound.forEach(p => r += `  ${DANGEROUS_PERMS[p]}\n`);

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
