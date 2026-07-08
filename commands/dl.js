import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { Config } from '../lib/handler.js';

const MAX_SIZE = 100 * 1024 * 1024;
const DOWNLOAD_TIMEOUT = 5 * 60 * 1000;

export default {
    name: 'dl',
    alias: ['download'],
    desc: 'Pakua file yoyote kutoka link. Ina support TinyURL, MediaFire',
    category: 'tools',
    use: '.dl <link>',
    async execute(sock, msg, args) {
        const m = {
            chat: msg.key.remoteJid,
            bot: sock,
            reply: async (txt) => await sock.sendMessage(msg.key.remoteJid, { text: txt }, { quoted: msg })
        };

        if (!args[0]) return m.reply('❌ Weka link ya kupakua\nMfano:.dl https://link.com/file.zip');

        let url = args[0];
        const downloadsDir = path.resolve('./downloads');
        let filePath = null; // TUMETENGENEZA HII KUWA GLOBAL

        try {
            await m.reply('⏳ *Inachanganua link...*');
            if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

            // 1. FUATILIA REDIRECT
            const initial = await axios.get(url, { maxRedirects: 5, headers: { 'User-Agent': 'Mozilla/5.0' } });
            url = initial.request.res.responseUrl || url;
            await m.reply(`📎 *Link iliyopatikana:* ${url}`);

            let downloadUrl = url;
            let fileName = path.basename(new URL(url).pathname.split('?')[0]) || `file_${Date.now()}`;
            fileName = fileName.replace(/[/\\?%*:|"<>]/g, '_');
            filePath = path.join(downloadsDir, fileName); // WEKA HAPA

            // 2. KAMA NI MEDIAFIRE
            if (url.includes('mediafire.com')) {
                await m.reply('📎 *Nimegundua MediaFire. Ninavunja link...*');
                const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                const $ = cheerio.load(data);

                downloadUrl = $('a#downloadButton').attr('href'); // FIX: tumia a#downloadButton
                const mfName = $('div.filename').text().trim();
                if(mfName) fileName = mfName;

                if (!downloadUrl) throw new Error('MediaFire imerudisha ukurasa wa tangazo. Jaribu tena baada ya sekunde 5');

                filePath = path.join(downloadsDir, fileName); // UPDATE FILEPATH
                await m.reply(`📥 *Inapakua:* ${fileName}`);
            }

            const controller = new AbortController();
            const downloadTimer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);

            const response = await axios({
                url: downloadUrl,
                method: 'GET',
                responseType: 'stream',
                timeout: DOWNLOAD_TIMEOUT,
                signal: controller.signal,
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.mediafire.com/' },
                validateStatus: (status) => status >= 200 && status < 400
            });
            clearTimeout(downloadTimer);

            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);
            await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });

            const stats = fs.statSync(filePath);
            const fileSize = (stats.size / 1024 / 1024).toFixed(2);
            if (stats.size === 0) throw new Error('Faili ni tupu 0 bytes');

            await m.reply(`✅ *Imeisha Kupakua!*\n📁 Jina: ${fileName}\n📊 Ukubwa: ${fileSize} MB\n📤 Inatuma sasa...`);

            await sock.sendMessage(m.chat, {
                document: fs.readFileSync(filePath), // TUMIA READFILESYNC ILI KUEPAKA ERROR YA STREAM
                fileName: fileName,
                mimetype: response.headers['content-type'] || 'application/vnd.android.package-archive',
                caption: Config?.caption || ''
            }, { quoted: msg });

        } catch (e) {
            console.error('[dl] Error:', e);
            await m.reply(`❌ *Imeshindwa Kupakua*\nSababu: ${e.message}`);
        } finally {
            // FUNGIA HAPA ILI SISIWEKE ERROR
            if (filePath && fs.existsSync(filePath)) {
                try { fs.unlinkSync(filePath); } catch {}
            }
        }
    }
};