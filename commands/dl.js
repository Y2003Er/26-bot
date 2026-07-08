import axios from 'axios';
import * as cheerio from 'cheerio'; // TUTAITAJA HII
import fs from 'fs';
import path from 'path';
import { Config } from '../lib/handler.js';

const MAX_SIZE = 100 * 1024 * 1024; // 100MB
const DOWNLOAD_TIMEOUT = 5 * 60 * 1000; // dakika 5

export default {
    name: 'dl',
    alias: ['download'],
    desc: 'Pakua file yoyote kutoka link. Ina support TinyURL, MediaFire, Direct',
    category: 'tools',
    use: '.dl <link>',
    async execute(sock, msg, args) {
        const m = {
            chat: msg.key.remoteJid,
            bot: sock,
            reply: async (txt) => {
                try {
                    await sock.sendMessage(msg.key.remoteJid, { text: txt }, { quoted: msg });
                } catch (err) {
                    console.error('[dl] Reply error:', err.message);
                }
            }
        };

        if (!args[0]) {
            return m.reply('❌ Tafadhali weka link ya kupakua\nMfano:.dl https://link.com/file.zip');
        }

        let url = args[0]; // TUMEBADILISHA KUWA let
        const downloadsDir = path.resolve('./downloads');
        const tempFilePath = path.join(downloadsDir, `temp_${Date.now()}`);

        let writer;
        let response;
        let downloadTimer;

        try {
            await m.reply('⏳ *Inachanganua link...*');

            if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

            // 1. FUATILIA REDIRECT YA TINYURL
            const initial = await axios.get(url, { maxRedirects: 5, headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) });
            url = initial.request.res.responseUrl || url; // Pata link ya mwisho
            await m.reply(`📎 *Link iliyopatikana:* ${url}`);

            let downloadUrl = url;
            let fileName = path.basename(new URL(url).pathname.split('?')[0]);
            if (!fileName || fileName.length < 3 ||!fileName.includes('.')) {
                fileName = `file_${Date.now()}`;
            }
            fileName = fileName.replace(/[/\\?%*:|"<>]/g, '_');
            const filePath = path.join(downloadsDir, fileName);

            // 2. KAMA NI MEDIAFIRE, TUNAVUNJA
            if (url.includes('mediafire.com')) {
                await m.reply('📎 *Nimegundua MediaFire. Ninavunja link...*');
                const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                const $ = cheerio.load(data);
                downloadUrl = $('#downloadButton').attr('href');
                const mfName = $('div.filename').text().trim();
                if(mfName) fileName = mfName;
                if (!downloadUrl) throw new Error('Imeshindwa kupata button ya download. Link imeexpire?');
                await m.reply(`📥 *Inapakua:* ${fileName}`);
            }

            const controller = new AbortController();
            downloadTimer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);

            response = await axios({
                url: downloadUrl,
                method: 'GET',
                responseType: 'stream',
                timeout: DOWNLOAD_TIMEOUT,
                maxRedirects: 5,
                maxContentLength: MAX_SIZE,
                signal: controller.signal,
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': url },
                validateStatus: (status) => status >= 200 && status < 400
            });

            clearTimeout(downloadTimer);

            const contentLength = parseInt(response.headers['content-length'] || 0, 10);
            if (contentLength && contentLength > MAX_SIZE) {
                response.data.destroy();
                return m.reply(`❌ Faili ni kubwa mno (${(contentLength / 1024 / 1024).toFixed(2)}MB). Kikomo ni ${MAX_SIZE / 1024 / 1024}MB`);
            }

            writer = fs.createWriteStream(filePath);
            let downloaded = 0;
            let aborted = false;

            response.data.on('data', (chunk) => {
                downloaded += chunk.length;
                if (downloaded > MAX_SIZE &&!aborted) {
                    aborted = true;
                    response.data.destroy();
                    writer.destroy();
                }
            });

            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
                response.data.on('error', reject);
            });

            if (aborted) {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                return m.reply(`❌ Faili imezidi kikomo cha ${MAX_SIZE / 1024 / 1024}MB, download imesitishwa`);
            }

            const stats = fs.statSync(filePath);
            const fileSize = (stats.size / 1024 / 1024).toFixed(2);

            if (stats.size === 0) {
                fs.unlinkSync(filePath);
                return m.reply('❌ Faili lililopakuliwa ni tupu (0 bytes). Angalia link yako');
            }

            await m.reply(`✅ *Imeisha Kupakua!*\n📁 Jina: ${fileName}\n📊 Ukubwa: ${fileSize} MB\n📤 Inatuma sasa...`);

            await sock.sendMessage(m.chat, {
                document: fs.createReadStream(filePath),
                fileName: fileName,
                mimetype: response.headers['content-type'] || 'application/octet-stream',
                caption: Config?.caption || ''
            }, { quoted: msg });

        } catch (e) {
            let userMsg = e.message;
            if (e.code === 'ERR_CANCELED' || e.name === 'CanceledError') {
                userMsg = `Muda wa kupakua umeisha (zaidi ya ${DOWNLOAD_TIMEOUT / 60000} dakika)`;
            } else if (e.code === 'ENOTFOUND') {
                userMsg = 'Link haipatikani (domain haipo)';
            } else if (e.code === 'ECONNREFUSED') {
                userMsg = 'Server imekataa muunganiko';
            } else if (e.response) {
                userMsg = `Server imerudisha kosa: ${e.response.status}`;
            }
            console.error('[dl] Error:', e);
            await m.reply(`❌ *Imeshindwa Kupakua*\nSababu: ${userMsg}`);
        } finally {
            clearTimeout(downloadTimer);
            if (writer &&!writer.destroyed) writer.destroy();
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                } catch (cleanupErr) {
                    console.error('[dl] Cleanup error:', cleanupErr.message);
                }
            }
        }
    }
};