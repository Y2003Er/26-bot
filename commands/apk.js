import fs from 'fs-extra';
import AdmZip from 'adm-zip';
import path from 'path';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';

// ─── DEX STRING EXTRACTOR ─────────────────────────────────────────────────────
// Inasoma binary .dex na kutoa printable strings (kama `strings` command ya Linux)
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

// ─── AXML BINARY MANIFEST PARSER (basic) ──────────────────────────────────────
// AndroidManifest.xml ndani ya APK ni binary AXML — tunasoma strings tu
function readManifestStrings(buffer) {
    return extractStringsFromBuffer(buffer, 4);
}

// ─── TIMEOUT WRAPPER ──────────────────────────────────────────────────────────
function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout baada ya ${ms / 1000}s`)), ms))
    ]);
}

// ─── FILE SIZE CHECK ──────────────────────────────────────────────────────────
const MAX_APK_MB = 80;
const MAX_FILE_READ_MB = 15;

// ─── PAYMENT KEYWORDS + CONTEXT ───────────────────────────────────────────────
const PAYMENT_KEYWORDS = [
    // East Africa
    { key: 'mpesa', label: 'M-Pesa (Safaricom/Vodacom)', risk: 'high' },
    { key: 'tigopesa', label: 'Tigo Pesa', risk: 'high' },
    { key: 'airtelmoney', label: 'Airtel Money', risk: 'high' },
    { key: 'halopesa', label: 'HaloPesa', risk: 'high' },
    { key: 'azampay', label: 'AzamPay', risk: 'high' },
    { key: 'selcom', label: 'Selcom', risk: 'high' },
    { key: 'pesalink', label: 'PesaLink', risk: 'high' },
    { key: 'nmbbank', label: 'NMB Bank', risk: 'medium' },
    { key: 'crdbbank', label: 'CRDB Bank', risk: 'medium' },
    // Global
    { key: 'stripe', label: 'Stripe', risk: 'medium' },
    { key: 'paypal', label: 'PayPal', risk: 'medium' },
    { key: 'flutterwave', label: 'Flutterwave', risk: 'medium' },
    { key: 'paystack', label: 'Paystack', risk: 'medium' },
    { key: 'razorpay', label: 'Razorpay', risk: 'medium' },
    { key: 'braintree', label: 'Braintree', risk: 'medium' },
    // Generic patterns
    { key: 'checkout', label: 'Checkout Flow', risk: 'low' },
    { key: 'billing', label: 'Billing System', risk: 'low' },
    { key: 'payment', label: 'Payment Generic', risk: 'low' },
    { key: 'transaction', label: 'Transaction', risk: 'low' },
    { key: 'wallet', label: 'Wallet', risk: 'low' },
    { key: 'subscribe', label: 'Subscription', risk: 'low' },
];

// Permissions na hatari zake
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

const cmd = {
    name: 'chambua',
    alias: ['apk', 'analyzeapk'],
    description: 'Uchambuzi wa kina wa APK — malipo, permissions, URLs, secrets.',
    category: 'tools',

    async execute(sock, msg, args) {
        const chatJid = msg.key.remoteJid;
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        const quotedMsg = contextInfo?.quotedMessage;
        const documentMessage = msg.message?.documentMessage || quotedMsg?.documentMessage;

        if (!documentMessage) {
            return await sock.sendMessage(chatJid, {
                text: '❌ Tuma faili la APK au reply kwenye APK kisha andika amri hii.'
            }, { quoted: msg });
        }

        const mime = documentMessage.mimetype || '';
        const fileName = documentMessage.fileName || 'unknown.apk';
        const fileSize = documentMessage.fileLength || 0;
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
        const apkPath = path.join(process.cwd(), `temp_apk_${timestamp}.apk`);
        const outputDir = path.join(process.cwd(), `extracted_apk_${timestamp}`);

        try {
            await withTimeout(runAnalysis(), 120_000); // 2 min timeout

            async function runAnalysis() {
                // ── 1. DOWNLOAD ──────────────────────────────────────────────
                const stream = await downloadContentFromMessage(documentMessage, 'document');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }
                await fs.writeFile(apkPath, buffer);

                // ── 2. EXTRACT ───────────────────────────────────────────────
                const zip = new AdmZip(apkPath);
                await fs.ensureDir(outputDir);
                zip.extractAllTo(outputDir, true);

                // ── 3. COLLECT FILES ─────────────────────────────────────────
                const allFiles = await collectFiles(outputDir, 4); // max depth 4

                // ── 4. ANALYZE ───────────────────────────────────────────────
                const foundUrls = new Set();
                const paymentMap = new Map(); // keyword -> Set<filename>
                const secretsFound = [];
                const permissions = [];
                let packageName = 'Haijulikani';
                let appVersion = '';
                let minSdk = '';
                let targetSdk = '';

                for (const fullPath of allFiles) {
                    const relName = path.relative(outputDir, fullPath);
                    const baseName = path.basename(fullPath);
                    const ext = path.extname(fullPath).toLowerCase();
                    const fileStat = await fs.stat(fullPath);

                    if (fileStat.size > MAX_FILE_READ_MB * 1024 * 1024) continue;

                    let content = '';

                    try {
                        if (ext === '.dex') {
                            // Binary → extract printable strings
                            const buf = await fs.readFile(fullPath);
                            content = extractStringsFromBuffer(buf);
                        } else if (baseName === 'AndroidManifest.xml') {
                            const buf = await fs.readFile(fullPath);
                            // Try text first (some tools produce decoded manifest)
                            const text = buf.toString('utf8');
                            if (text.includes('<?xml') || text.includes('manifest')) {
                                content = text;
                            } else {
                                // Binary AXML — extract strings
                                content = readManifestStrings(buf);
                            }
                        } else if (['.xml', '.json', '.js', '.html', '.txt', '.properties', '.yaml', '.yml', '.gradle'].includes(ext)) {
                            content = await fs.readFile(fullPath, 'utf8');
                        } else if (relName.startsWith('assets/') || relName.startsWith('res/')) {
                            try {
                                content = await fs.readFile(fullPath, 'utf8');
                            } catch { continue; }
                        } else {
                            continue;
                        }
                    } catch { continue; }

                    const lower = content.toLowerCase();

                    // ── Payment Keywords ──────────────────────────────────────
                    for (const { key, label } of PAYMENT_KEYWORDS) {
                        if (lower.includes(key)) {
                            const mapKey = label;
                            if (!paymentMap.has(mapKey)) paymentMap.set(mapKey, new Set());
                            paymentMap.get(mapKey).add(baseName);
                        }
                    }

                    // ── URLs ──────────────────────────────────────────────────
                    const urlRegex = /https?:\/\/[^\s"'`<>\\)]{8,}/g;
                    const urls = content.match(urlRegex) || [];
                    for (const u of urls) {
                        const clean = u.replace(/[.,;:!?)]+$/, '');
                        if (!clean.includes('schemas.android.com') &&
                            !clean.includes('w3.org') &&
                            !clean.includes('example.com') &&
                            clean.length < 200) {
                            foundUrls.add(clean);
                        }
                    }

                    // ── Secrets / API Keys ────────────────────────────────────
                    detectSecrets(content, baseName, secretsFound);

                    // ── Permissions ───────────────────────────────────────────
                    const permRegex = /android\.permission\.([A-Z_]+)/g;
                    let m;
                    while ((m = permRegex.exec(content)) !== null) {
                        if (!permissions.includes(m[1])) permissions.push(m[1]);
                    }

                    // ── Manifest Metadata ─────────────────────────────────────
                    if (baseName === 'AndroidManifest.xml') {
                        const pkgMatch = content.match(/package[=\s:]+["']?([a-z][a-z0-9_.]+)/i);
                        if (pkgMatch) packageName = pkgMatch[1];
                        const verMatch = content.match(/versionName[=\s:]+["']?([\d.]+)/i);
                        if (verMatch) appVersion = verMatch[1];
                        const minMatch = content.match(/minSdkVersion[=\s:]+["']?(\d+)/i);
                        if (minMatch) minSdk = minMatch[1];
                        const targetMatch = content.match(/targetSdkVersion[=\s:]+["']?(\d+)/i);
                        if (targetMatch) targetSdk = targetMatch[1];
                    }
                }

                // ── 5. BUILD REPORT ───────────────────────────────────────────
                const riskScore = calcRisk(paymentMap, permissions, secretsFound);

                let ripoti = `🕵️‍♂️ *RIPOTI YA UCHAMBUZI - 26-BOT*\n`;
                ripoti += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                ripoti += `📦 *Faili:* \`${fileName}\` (${fileSizeMB}MB)\n`;
                ripoti += `🆔 *Package:* \`${packageName}\`\n`;
                if (appVersion) ripoti += `📌 *Version:* \`${appVersion}\`\n`;
                if (minSdk) ripoti += `📱 *Min SDK:* \`${minSdk}\` | *Target:* \`${targetSdk || '?'}\`\n`;
                ripoti += `⚠️ *Risk Score:* ${riskScore.badge} (${riskScore.score}/10)\n\n`;

                // PAYMENTS
                ripoti += `💰 *MIFUMO YA MALIPO (${paymentMap.size}):*\n`;
                if (paymentMap.size > 0) {
                    for (const [label, files] of paymentMap.entries()) {
                        const src = Array.from(files).slice(0, 3).join(', ');
                        ripoti += `  💳 *${label}*\n     📍 _${src}_\n`;
                    }
                } else {
                    ripoti += `  🍃 _Hakuna viashiria vya malipo._\n`;
                }

                // SECRETS
                if (secretsFound.length > 0) {
                    ripoti += `\n🔑 *SECRETS/API KEYS (${secretsFound.length}):*\n`;
                    secretsFound.slice(0, 5).forEach(s => {
                        ripoti += `  🚨 \`${s.type}\` katika \`${s.file}\`\n     _${s.preview}_\n`;
                    });
                    if (secretsFound.length > 5) ripoti += `  _...na ${secretsFound.length - 5} zaidi_\n`;
                }

                // PERMISSIONS
                const dangerousFound = permissions.filter(p => DANGEROUS_PERMS[p]);
                const safeFound = permissions.filter(p => !DANGEROUS_PERMS[p]);

                ripoti += `\n🛡️ *RUHUSA (${permissions.length} total):*\n`;
                if (dangerousFound.length > 0) {
                    ripoti += `*Hatari:*\n`;
                    dangerousFound.forEach(p => {
                        ripoti += `  ${DANGEROUS_PERMS[p]}: \`${p}\`\n`;
                    });
                }
                if (safeFound.length > 0) {
                    ripoti += `*Kawaida:* ${safeFound.slice(0, 5).map(p => `\`${p}\``).join(', ')}`;
                    if (safeFound.length > 5) ripoti += ` _+${safeFound.length - 5} zaidi_`;
                    ripoti += '\n';
                }
                if (permissions.length === 0) ripoti += `  🍃 _Hakuna ruhusa zilizopatikana._\n`;

                // URLS
                const urlArray = Array.from(foundUrls);
                const paymentUrls = urlArray.filter(u => PAYMENT_KEYWORDS.some(k => u.toLowerCase().includes(k.key)));
                const otherUrls = urlArray.filter(u => !PAYMENT_KEYWORDS.some(k => u.toLowerCase().includes(k.key)));

                ripoti += `\n🔗 *VIUNGO (${foundUrls.size} total):*\n`;
                if (paymentUrls.length > 0) {
                    ripoti += `*Viungo vya Malipo:*\n`;
                    paymentUrls.slice(0, 4).forEach(u => ripoti += `  🎯 ${u}\n`);
                }
                if (otherUrls.length > 0) {
                    ripoti += `*Vingine:*\n`;
                    otherUrls.slice(0, 4).forEach(u => ripoti += `  📌 ${u}\n`);
                    if (otherUrls.length > 4) ripoti += `  _...na ${otherUrls.length - 4} zaidi_\n`;
                }
                if (foundUrls.size === 0) ripoti += `  🍃 _Hakuna URLs._\n`;

                ripoti += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                ripoti += `✅ _Uchambuzi umekamilika!_`;

                await sock.sendMessage(chatJid, { text: ripoti }, { quoted: msg });
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

// ─── HELPERS ──────────────────────────────────────────────────────────────────

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
            const nested = await collectFiles(fullPath, maxDepth, currentDepth + 1);
            results.push(...nested);
        } else {
            results.push(fullPath);
        }
    }
    return results;
}

const SECRET_PATTERNS = [
    { type: 'Firebase API Key', regex: /AIza[0-9A-Za-z\-_]{35}/ },
    { type: 'Google OAuth', regex: /[0-9]+-[0-9A-Za-z_]{32}\.apps\.googleusercontent\.com/ },
    { type: 'AWS Key', regex: /AKIA[0-9A-Z]{16}/ },
    { type: 'Stripe Key', regex: /sk_(live|test)_[0-9a-zA-Z]{24,}/ },
    { type: 'Stripe Pub Key', regex: /pk_(live|test)_[0-9a-zA-Z]{24,}/ },
    { type: 'Private Key Header', regex: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/ },
    { type: 'Generic Secret', regex: /(?:secret|api[_-]?key|private[_-]?key)\s*[=:]\s*["']([A-Za-z0-9\-_./+]{16,})["']/i },
    { type: 'Bearer Token', regex: /Bearer\s+[A-Za-z0-9\-_=+/]{20,}/ },
];

function detectSecrets(content, fileName, results) {
    for (const { type, regex } of SECRET_PATTERNS) {
        const match = content.match(regex);
        if (match) {
            const preview = match[0].substring(0, 40) + (match[0].length > 40 ? '...' : '');
            // Avoid duplicates
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

    let badge;
    if (score <= 2) badge = '🟢 Chini';
    else if (score <= 5) badge = '🟡 Wastani';
    else if (score <= 7) badge = '🟠 Juu';
    else badge = '🔴 Hatari Sana';

    return { score, badge };
}

export default cmd;