import fs from 'fs-extra';
import AdmZip from 'adm-zip';
import path from 'path';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';

const cmd = {
    name: 'chambua',
    alias: ['apk', 'analyzeapk'],
    description: 'Uchambuzi wa kina wa APK unaotaja faili zenye mifumo ya malipo.',
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
            text: '🕵️‍♂️ *Tunaanza Uchambuzi wa Kina (Deep Scan)...*\n_Tunatafuta maeneo kamili na mafaili yenye mifumo ya malipo._' 
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
            // Hapa tutahifadhi vitu kwa muundo wa "NENO -> JINA LA FAILI"
            let paymentMap = new Map(); 
            let permissions = [];
            let packageName = "Haijulikani (Imefichwa)";

            const urlRegex = /https?:\/\/[^\s"'`<>]+/g;
            const permissionRegex = /android\.permission\.[A-Z_]+/g;
            
            const paymentKeywords = [
                'mpesa', 'pesa', 'tigopesa', 'airtelmoney', 'halo-pesa', 'selcom', 
                'azampay', 'stripe', 'paypal', 'flutterwave', 'paystack', 'checkout', 
                'billing', 'payment', 'transaction', 'invoice', 'wallet'
            ];

            const files = await fs.readdir(outputDir, { recursive: true });

            for (const file of files) {
                const fullPath = path.join(outputDir, file);
                const stat = await fs.stat(fullPath);

                if (stat.isFile()) {
                    // Tunatafuta kwenye kodi zote (.dex), xml, json au kwenye mali zilizomo (assets)
                    if (file.endsWith('.xml') || file.endsWith('.dex') || file.includes('assets/') || file.endsWith('.json')) {
                        try {
                            const content = await fs.readFile(fullPath, 'utf8');
                            const lowerContent = content.toLowerCase();
                            const baseFileName = path.basename(file); // Mfano: classes.dex au classes2.dex

                            // 1. Tafuta Malipo na Uhifadhi faili ilipopatikana
                            paymentKeywords.forEach(keyword => {
                                if (lowerContent.includes(keyword)) {
                                    const keyUpper = keyword.toUpperCase();
                                    if (!paymentMap.has(keyUpper)) {
                                        paymentMap.set(keyUpper, new Set());
                                    }
                                    paymentMap.get(keyUpper).add(baseFileName);
                                }
                            });

                            // 2. Nasa URLs
                            const urls = content.match(urlRegex);
                            if (urls) {
                                urls.forEach(u => {
                                    if (!u.includes('schemas.android.com') && !u.includes('w3.org')) {
                                        const cleanUrl = u.split(/[)"'`]/)[0];
                                        foundUrls.add(cleanUrl);
                                        
                                        if (paymentKeywords.some(k => cleanUrl.toLowerCase().includes(k))) {
                                            const keyApi = `API: ${cleanUrl}`;
                                            if (!paymentMap.has(keyApi)) {
                                                paymentMap.set(keyApi, new Set());
                                            }
                                            paymentMap.get(keyApi).add(baseFileName);
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
                            // Pitia mafaili yasiyosomika
                        }
                    }
                }
            }

            // KUANDAA RIPOTI
            let ripoti = `🕵️‍♂️ *RIPOTI YA UCHAMBUZI WA KINA (26-BOT)*\n`;
            ripoti += `===============================\n\n`;
            ripoti += `📝 *Jina la Faili:* \`${fileName}\`\n`;
            ripoti += `🆔 *Package Name:* \`${packageName}\`\n\n`;

            // 💰 SEHEMU YA MALIPO (PAYMENTS & LOCATIONS)
            ripoti += `💰 *MIFUMO YA MALIPO NA MAENEO YALIPO:*\n`;
            if (paymentMap.size > 0) {
                for (let [keyword, filesFound] of paymentMap.entries()) {
                    const filesList = Array.from(filesFound).join(', ');
                    ripoti += `  💳 \`${keyword}\` \n     📍 _Kwenye faili:_ [\`${filesList}\`]\n\n`;
                }
            } else {
                ripoti += `  🍃 _Hakuna viashiria vya mifumo ya malipo vilivyopatikana._\n\n`;
            }

            // 🛡️ RUHUSA (PERMISSIONS)
            ripoti += `🛡️ *RUHUSA ZILIZOPATIKANA (${permissions.length}):*\n`;
            if (permissions.length > 0) {
                permissions.slice(0, 8).forEach(p => {
                    const shortPerm = p.replace('android.permission.', '');
                    if (['READ_SMS', 'RECEIVE_SMS', 'RECORD_AUDIO', 'CAMERA', 'ACCESS_FINE_LOCATION'].some(danger => shortPerm.includes(danger))) {
                        ripoti += `  ⚠️ \`${shortPerm}\` *(Hatari)*\n`;
                    } else {
                        ripoti += `  🔹 \`${shortPerm}\`\n`;
                    }
                });
                if (permissions.length > 8) ripoti += `  *...na zingine ${permissions.length - 8}*\n`;
            }

            // 🔗 VIUNGO (URLs)
            ripoti += `\n🔗 *VIUNGO VYA NETWORK (URLs) [${foundUrls.size}]:*\n`;
            if (foundUrls.size > 0) {
                const urlList = Array.from(foundUrls).slice(0, 5);
                urlList.forEach(u => {
                    ripoti += `  📌 ${u}\n`;
                });
                if (foundUrls.size > 5) ripoti += `  _...na link zingine ${foundUrls.size - 5} zimegundulika._\n`;
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
