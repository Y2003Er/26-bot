import fs from 'fs-extra';
import AdmZip from 'adm-zip';
import path from 'path';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';

const cmd = {
    name: 'chambua',
    alias: ['apk', 'analyzeapk'],
    description: 'Uchambuzi wa kina wa APK ikiwemo mifumo ya malipo na URLs.',
    category: 'tools',
    async execute(sock, msg, args) {
        const chatJid = msg.key.remoteJid;
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        const quotedMsg = contextInfo?.quotedMessage;
        const documentMessage = msg.message?.documentMessage || quotedMsg?.documentMessage;
        
        if (!documentMessage) {
            return await sock.sendMessage(chatJid, {
                text: '❌ Tafadhali tuma faili la APK au tag faili la APK kisha uandike amri hii.'
            }, { quoted: msg });
        }

        const mime = documentMessage.mimetype || '';
        const fileName = documentMessage.fileName || '';

        if (!mime.includes('android') && !fileName.endsWith('.apk')) {
            return await sock.sendMessage(chatJid, {
                text: '❌ Faili hili halionekani kuwa la Android (APK).'
            }, { quoted: msg });
        }

        await sock.sendMessage(chatJid, { 
            text: '🕵️‍♂️ *Tunaanza Uchambuzi wa Kina (Deep Scan)...*\n_Tunatafuta Ruhusa, Link, na Sehemu za Malipo (Payments)._' 
        }, { quoted: msg });

        const apkPath = path.join(process.cwd(), `temp_${Date.now()}.apk`);
        const outputDir = path.join(process.cwd(), `extracted_${Date.now()}`);

        try {
            const stream = await downloadContentFromMessage(documentMessage, 'document');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            await fs.writeFile(apkPath, buffer);

            const zip = new AdmZip(apkPath);
            await fs.ensureDir(outputDir);
            zip.extractAllTo(outputDir, true);

            let foundUrls = new Set();
            let paymentGateways = new Set();
            let permissions = [];
            let packageName = "Haijulikani (Imefichwa)";

            // REGEX & KEYWORDS ZA MALIPO
            const urlRegex = /https?:\/\/[^\s"'`<>]+/g;
            const permissionRegex = /android\.permission\.[A-Z_]+/g;
            
            // Maneno yanayoashiria mifumo ya malipo ya ndani na nje
            const paymentKeywords = [
                'mpesa', 'pesa', 'tigopesa', 'airtelmoney', 'halo-pesa', 'selcom', 
                'azampay', 'stripe', 'paypal', 'flutterwave', 'paystack', 'checkout', 
                'billing', 'payment', 'transaction', 'invoice', 'wallet', 'api/v1/pay'
            ];

            const files = await fs.readdir(outputDir, { recursive: true });

            for (const file of files) {
                const fullPath = path.join(outputDir, file);
                const stat = await fs.stat(fullPath);

                if (stat.isFile()) {
                    if (file.endsWith('.xml') || file.endsWith('.dex') || file.includes('assets/') || file.endsWith('.json')) {
                        try {
                            const content = await fs.readFile(fullPath, 'utf8');
                            const lowerContent = content.toLowerCase();

                            // 1. Winda Sehemu za Malipo
                            paymentKeywords.forEach(keyword => {
                                if (lowerContent.includes(keyword)) {
                                    // Kama neno limepatikana, tunanasa sehemu hiyo ilipo
                                    paymentGateways.add(keyword.toUpperCase());
                                }
                            });

                            // 2. Nasa URLs
                            const urls = content.match(urlRegex);
                            if (urls) {
                                urls.forEach(u => {
                                    if (!u.includes('schemas.android.com') && !u.includes('w3.org')) {
                                        const cleanUrl = u.split(/[)"'`]/)[0];
                                        foundUrls.add(cleanUrl);
                                        
                                        // Kama URL ina maneno ya malipo, iweke pia kwenye malipo
                                        if (paymentKeywords.some(k => cleanUrl.toLowerCase().includes(k))) {
                                            paymentGateways.add(`API Link: ${cleanUrl}`);
                                        }
                                    }
                                });
                            }

                            // 3. Nasa Permissions
                            const perms = content.match(permissionRegex);
                            if (perms) {
                                perms.forEach(p => {
                                    if (!permissions.includes(p)) permissions.push(p);
                                });
                            }

                            if (file.endsWith('AndroidManifest.xml') && content.includes('package=')) {
                                const pkgMatch = content.match(/package="([^"]+)"/);
                                if (pkgMatch) packageName = pkgMatch[1];
                            }
                        } catch (e) {
                            // Faili lisilosomeka linapitwa
                        }
                    }
                }
            }

            // KUANDAA RIPOTI
            let ripoti = `🕵️‍♂️ *RIPOTI YA UCHAMBUZI WA KINA (26-BOT)*\n`;
            ripoti += `===============================\n\n`;
            ripoti += `📝 *Jina la Faili:* \`${fileName}\`\n`;
            ripoti += `🆔 *Package Name:* \`${packageName}\`\n\n`;

            // 💰 SEHEMU YA MALIPO (PAYMENTS)
            ripoti += `💰 *MIFUMO YA MALIPO / TRANSACTIONS:*\n`;
            if (paymentGateways.size > 0) {
                Array.from(paymentGateways).forEach(pg => {
                    ripoti += `  💳 \`${pg}\`\n`;
                });
            } else {
                ripoti += `  🍃 _Hakuna viashiria vya wazi vya mifumo ya malipo vilivyopatikana._\n`;
            }

            // 🛡️ RUHUSA (PERMISSIONS)
            ripoti += `\n🛡️ *RUHUSA ZILIZOPATIKANA (${permissions.length}):*\n`;
            if (permissions.length > 0) {
                permissions.slice(0, 10).forEach(p => {
                    const shortPerm = p.replace('android.permission.', '');
                    if (['READ_SMS', 'RECEIVE_SMS', 'RECORD_AUDIO', 'CAMERA', 'ACCESS_FINE_LOCATION'].some(danger => shortPerm.includes(danger))) {
                        ripoti += `  ⚠️ \`${shortPerm}\` *(Hatari)*\n`;
                    } else {
                        ripoti += `  🔹 \`${shortPerm}\`\n`;
                    }
                });
                if (permissions.length > 10) ripoti += `  *...na zingine ${permissions.length - 10}*\n`;
            }

            // 🔗 VIUNGO (URLs)
            ripoti += `\n🔗 *VIUNGO VYA NETWORK (URLs) [${foundUrls.size}]:*\n`;
            if (foundUrls.size > 0) {
                const urlList = Array.from(foundUrls).slice(0, 8);
                urlList.forEach(u => {
                    ripoti += `  📌 ${u}\n`;
                });
                if (foundUrls.size > 8) ripoti += `  _...na link zingine ${foundUrls.size - 8} zimegundulika._\n`;
            }

            ripoti += `\n===============================\n`;
            ripoti += `_Uchambuzi umekamilika kikamilifu!_`;

            await sock.sendMessage(chatJid, { text: ripoti }, { quoted: msg });

        } catch (error) {
            console.error(error);
            await sock.sendMessage(chatJid, { text: `❌ Hitilafu: ${error.message}` }, { quoted: msg });
        } finally {
            await fs.remove(apkPath).catch(() => {});
            await fs.remove(outputDir).catch(() => {});
        }
    }
};

export default cmd;
