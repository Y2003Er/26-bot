import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

const MAX_SIZE = 100 * 1024 * 1024; // 100MB
const DOWNLOAD_TIMEOUT = 5 * 60 * 1000; // dakika 5

export default {
    name: 'dl',
    alias: ['download'],
    desc: 'Pakua file yoyote. Inasaidia MediaFire na Direct Link',
    category: 'tools',
    use: '.dl <link>',
    async execute(sock, msg, args) {
        const m = {
            chat: msg.key.remoteJid,
            reply: async (txt) => await sock.sendMessage(msg.key.remoteJid, { text: txt }, { quoted: msg })
        };

        if (!args[0]) return m.reply('❌ Weka link ya kupakua\n*Mfano:* `.dl https://mediafire.com/...`');

        let url = args[0];
        const downloadsDir = path.resolve('./downloads');
        let filePath = null;

        try {
            await m.reply('⏳ *Inachanganua link...*');
            if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

            let downloadUrl = url;
            let fileName = `file_${Date.now()}.bin`;

            // 1. KAMA NI 5MODAPK / GETMODSAPK - TUMIA AXIOS TU
            if (url.includes('5modapk.com') || url.includes('getmodsapk.com')) {
                await m.reply('⚠️ *5modapk inahitaji puppeteer*\nNajaribu kuvunja kwa axios... Ikiishindwa tumia link nyingine');

                const { data } = await axios.get(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' },
                    timeout: 30000
                });
                const $ = cheerio.load(data);

                // Tafuta button ya download
                downloadUrl = $('a.btn-download, a#downloadButton, a[href*=".apk"]').first().attr('href');
                if (!downloadUrl) throw new Error('Sikupata link ya download. Tovuti imezuia bot.');

                if (!downloadUrl.startsWith('http')) downloadUrl = new URL(downloadUrl, url).href;
                fileName = downloadUrl.split('/').pop().split('?')[0];
                fileName = fileName.replace(/[/\\?%*:|"<>]/g, '_');
            }

            // 2. KAMA NI MEDIAFIRE
            else if (url.includes('mediafire.com')) {
                await m.reply('📎 *Nimegundua MediaFire. Ninavunja link...*');
                const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                const $ = cheerio.load(data);
                downloadUrl = $('a#downloadButton').attr('href');
                fileName = $('div.filename').text().trim() || fileName;
                if (!downloadUrl) throw new Error('Link ya MediaFire imeexpire');
            }

            // 3. KAMA NI DIRECT LINK
            else {
                fileName = url.split('/').pop().split('?')[0] || fileName;
                fileName = fileName.replace(/[/\\?%*:|"<>]/g, '_');
            }

            filePath = path.join(downloadsDir, fileName);
            await m.reply(`📥 *Inapakua:* ${fileName}`);

            const response = await axios({
                url: downloadUrl,
                method: 'GET',
                responseType: 'stream',
                timeout: DOWNLOAD_TIMEOUT,
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.google.com/' },
                maxContentLength: MAX_SIZE
            });

            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);
            await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });

            const stats = fs.statSync(filePath);
            const fileSize = (stats.size / 1024 / 1024).toFixed(2);

            if(stats.size > MAX_SIZE) {
                fs.unlinkSync(filePath);
                return m.reply(`❌ File ni kubwa sana: ${fileSize} MB. Max ni 100MB`)
            }

            await m.reply(`✅ *Imeisha!* ${fileSize} MB\n📤 Inatuma...`);

            await sock.sendMessage(m.chat, {
                document: fs.readFileSync(filePath),
                fileName: fileName,
                mimetype: 'application/octet-stream'
            }, { quoted: msg });

        } catch (e) {
            console.error('[dl] Error:', e);
            await m.reply(`❌ *Imeshindwa*\nSababu: ${e.message}\n\n*Note:* 5modapk bila puppeteer mara nyingi inashindwa. Tumia MediaFire au Direct link`);
        } finally {
            if (filePath && fs.existsSync(filePath)) {
                try { fs.unlinkSync(filePath); } catch {}
            }
        }
    }
};
