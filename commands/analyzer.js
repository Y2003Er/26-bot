import fs from 'fs-extra';
import AdmZip from 'adm-zip';
import path from 'path';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';

export const name = 'chambua';
export const alias = ['apk', 'analyzeapk'];
export const description = 'Kuchambua faili la Android APK na kuona yaliyomo.';
export const category = 'tools';

export async function execute(sock, msg, args) {
    const chatJid = msg.key.remoteJid;
    
    // 1. Tafuta ujumbe ulio na faili (iwe ni mpya au uliotagw/quoted)
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    const quotedMsg = contextInfo?.quotedMessage;
    
    // Angalia kama ujumbe wenyewe au ule uliotagwa una document/faili
    const documentMessage = msg.message?.documentMessage || quotedMsg?.documentMessage;
    
    if (!documentMessage) {
        return await sock.sendMessage(chatJid, {
            text: '❌ Tafadhali tuma faili la APK au tag (quote) faili la APK kisha uandike amri hii.'
        }, { quoted: msg });
    }

    const mime = documentMessage.mimetype || '';
    const fileName = documentMessage.fileName || '';

    // Hakikisha ni APK halisi
    if (!mime.includes('android') && !fileName.endsWith('.apk')) {
        return await sock.sendMessage(chatJid, {
            text: '❌ Faili hili halionekani kuwa la Android (APK).'
        }, { quoted: msg });
    }

    await sock.sendMessage(chatJid, { text: '⏳ *Tunapakua na kuanza uchambuzi wa APK, subiri kidogo...*' }, { quoted: msg });

    const apkPath = path.join(process.cwd(), `temp_${Date.now()}.apk`);
    const outputDir = path.join(process.cwd(), 'extracted_apk');

    try {
        // 2. Pakua faili kutoka WhatsApp kwa kutumia Baileys util iliyopo kwenye handler yako
        const stream = await downloadContentFromMessage(documentMessage, 'document');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        
        // Hifadhi faili kwa muda
        await fs.writeFile(apkPath, buffer);

        // 3. Hakikisha folda la matokeo lipo safi
        await fs.emptyDir(outputDir);

        // 4. Fungua APK kama ZIP
        const zip = new AdmZip(apkPath);
        const zipEntries = zip.getEntries();
        
        const hasManifest = zipEntries.some(entry => entry.entryName === 'AndroidManifest.xml');
        const dexFiles = zipEntries.filter(entry => entry.entryName.endsWith('.dex'));
        const hasAssets = zipEntries.some(entry => entry.entryName.startsWith('assets/'));
        const hasLib = zipEntries.some(entry => entry.entryName.startsWith('lib/'));

        if (!hasManifest) {
            await fs.remove(apkPath);
            return await sock.sendMessage(chatJid, { text: '❌ Muundo wa faili umeharibika (AndroidManifest.xml haijapatikana).' }, { quoted: msg });
        }

        // 5. Tengeneza Ripoti
        let ripoti = `📊 *MATOKEO YA UCHAMBUZI (26-BOT)*\n\n`;
        ripoti += `📝 *Jina:* \`${fileName}\`\n`;
        ripoti += `📦 *AndroidManifest.xml:* ✅ Ipo\n`;
        ripoti += `🗂️ *Kodi (.dex files):* ${dexFiles.length}\n`;
        ripoti += `📁 *Assets Folder:* ${hasAssets ? '✅ Lipo' : '❌ Halipo'}\n`;
        ripoti += `⚙️ *Native Libraries (lib):* ${hasLib ? '✅ Zipo' : '❌ Hazipo'}\n\n`;
        ripoti += `_Uchambuzi wa awali umekamilika kikamilika!_`;

        await sock.sendMessage(chatJid, { text: ripoti }, { quoted: msg });

    } catch (error) {
        console.error('APK Analyzer Error:', error);
        await sock.sendMessage(chatJid, { text: `❌ Hitilafu imetokea: ${error.message}` }, { quoted: msg });
    } finally {
        // Futa faili la temp kila mara ili kulinda RAM na Storage
        await fs.remove(apkPath).catch(() => {});
    }
}
