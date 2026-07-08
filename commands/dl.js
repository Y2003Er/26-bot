import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { Config } from '../lib/handler.js';

const MAX_SIZE = 100 * 1024 * 1024; // 100MB
const DOWNLOAD_TIMEOUT = 5 * 60 * 1000; // 5min

// HEADERS ZA UNIVERSAL - ZINAFANYA KAZI KWA SITES ZOTE
const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.google.com/',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
};

export default {
    name: 'dl',
    alias: ['download'],
    desc: 'Pakua file yoyote kutoka link. Ina support TinyURL, MediaFire, 5modapk, Direct',
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
        let filePath = null;

        try {
            await m.reply('⏳ *Inachanganua link...*');
            if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

            // 1. FUATILIA REDIRECT
            const initial = await axios.get(url, {
                maxRedirects: 10,
                headers: BROWSER_HEADERS,
                timeout: DOWNLOAD_TIMEOUT
            });
            url = initial.request.res.responseUrl || url;
            await m.reply(`📎 *Link iliyopatikana:* ${url}`);

            let downloadUrl = url;
            let fileName = path.basename(new URL(url).pathname.split('?')[0]) || `file_${Date.now()}`;
            fileName = fileName.replace(/[/\\?%*:|"<>]/g, '_');
            // Kama jina ni refu sana lipunguze
            if(fileName.length > 150) fileName = fileName.substring(0, 150);
            if(!fileName.includes('.')) fileName += '.bin'; // Ikiwa haina extension
            filePath = path.join(downloadsDir, fileName);

            // 2. KAMA NI MEDIAFIRE - VUNJA LINK
            if (url.includes('mediafire.com')) {
                await m.reply('📎 *Nimegundua MediaFire. Ninavunja link...*');
                const { data } = await axios.get(url, { headers: BROWSER_HEADERS });
                const $ = cheerio.load(data);

                downloadUrl = $('a#downloadButton').attr('href');
                const mfName = $('div.filename').text().trim();
                if(mfName) fileName = mfName.replace(/[/\\?%*:|"<>]/g, '_');

                if (!downloadUrl) throw new Error('MediaFire imerudisha ukurasa wa tangazo. Jaribu tena baada ya sekunde 5');
                filePath = path.join(downloadsDir, fileName);
            }

            await m.reply(`📥 *Inapakua:* ${fileName}`);

            const controller = new AbortController();
            const downloadTimer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);

            // 3. PAKUA KWA HEADERS ZA BROWSER
            const response = await axios({
                url: downloadUrl,
                method: 'GET',
                responseType: 'stream',
                timeout: DOWNLOAD_TIMEOUT,
                maxRedirects: 10,
                signal: controller.signal,
                headers: BROWSER_HEADERS,
                validateStatus: (status) => status >= 200 && status < 400
            });
            clearTimeout(downloadTimer);

            const contentLength = parseInt(response.headers['content-length'] || 0);
            if (contentLength > MAX_SIZE) throw new Error(`Faili ni kubwa sana: ${(contentLength/1024/1024).toFixed(2)}MB. Max: 100MB`);

            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);
            await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });

            const stats = fs.statSync(filePath);
            const fileSize = (stats.size / 1024 / 1024).toFixed(2);
            if (stats.size === 0) throw new Error('Faili ni tupu 0 bytes');

            await m.reply(`✅ *Imeisha Kupakua!*\n📁 Jina: ${fileName}\n📊 Ukubwa: ${fileSize} MB\n📤 Inatuma sasa...`);

            // 4. TUMA FILE - MIMETYPE ACHA WHATSAPP IJUE YENYEWE
            let mimetype = response.headers['content-type'] || 'application/octet-stream';

            await sock.sendMessage(m.chat, {
                document: fs.readFileSync(filePath),
                fileName: fileName,
                mimetype: mimetype,
                caption: `*${fileName}*\nUkubwa: ${fileSize} MB\n_26-TECH Bot_`
            }, { quoted: msg });

        } catch (e) {
            console.error('[dl] Error:', e);
            await m.reply(`❌ *Imeshindwa Kupakua*\nSababu: ${e.message}`);
        } finally {
            if (filePath && fs.existsSync(filePath)) {
                try { fs.unlinkSync(filePath); } catch {}
            }
        }
    }
};