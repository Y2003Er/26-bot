import fs from 'fs-extra';
import AdmZip from 'adm-zip';
import { execa } from 'execa';
import path from 'path';

export default {
    name: 'chambua',
    alias: ['analyzeapk', 'apk', 'checkapk'],
    category: 'tools',
    desc: 'Kuchambua faili la Android APK nyuma ya pazia.',
    
    async execute(m, { sock, args }) {
        // 1. Angalia kama mtumiaji ametuma au ameku-quote faili (document)
        const quoted = m.quoted ? m.quoted : m;
        const mime = quoted.mimetype || '';

        // Hakikisha ni faili la APK (mafaili mengi ya APK yanakuja kama 'application/vnd.android.package-archive')
        if (!mime.includes('android') && !m.body.endsWith('.apk')) {
            return m.reply('Tafadhali tuma faili la APK au tag faili la APK kisha uandike amri hii.');
        }

        await m.reply('⏳ Tunapakua na kuanza uchambuzi wa faili, subiri kidogo...');

        try {
            // 2. Pakua faili la APK kutoka WhatsApp kwenda kwenye seva yako
            // Hapa tunatumia njia ya kawaida ya Baileys ya kudownload media
            const buffer = await quoted.download();
            const apkPath = path.join(process.cwd(), `temp_${Date.now()}.apk`);
            await fs.writeFile(apkPath, buffer);

            const outputDir = path.join(process.cwd(), 'extracted_apk');
            
            // 3. Hakikisha folda la kutolea faili lipo safi
            await fs.emptyDir(outputDir);

            // 4. Tumia adm-zip kufungua APK haraka
            const zip = new AdmZip(apkPath);
            const zipEntries = zip.getEntries();
            
            // Tafuta faili muhimu
            const hasManifest = zipEntries.some(entry => entry.entryName === 'AndroidManifest.xml');
            const dexFiles = zipEntries.filter(entry => entry.entryName.endsWith('.dex'));

            if (!hasManifest) {
                // Futa faili la temporary kabla ya kutoka
                await fs.remove(apkPath);
                return m.reply('❌ Hili halionekani kuwa faili halali la Android APK.');
            }

            // 5. Tengeneza ujumbe wa ripoti kwenda kwa mtumiaji
            let ripoti = `*📊 MATOKEO YA UCHAMBUZI WA APK*\n\n`;
            ripoti += `📝 *Jina la Faili:* ${m.body || 'WhatsApp_Document'}\n`;
            ripoti += `📦 *AndroidManifest.xml:* ${hasManifest ? '✅ Ipo' : '❌ Haipo'}\n`;
            ripoti += `🗂️ *Idadi ya faili za kodi (.dex):* ${dexFiles.length}\n\n`;
            ripoti += `_Uchambuzi wa awali umekamilika. Hatua inayofuata ni kuunganisha jadx-cli kwa uchambuzi wa ndani zaidi._`;

            await sock.sendMessage(m.from, { text: ripoti }, { quoted: m });

            // 6. Futa faili la temporary lililopakuliwa kusafisha nafasi (storage)
            await fs.remove(apkPath);

        } catch (error) {
            console.error(error);
            m.reply(`❌ Hitilafu imetokea wakati wa kuchambua faili: ${error.message}`);
        }
    }
};
