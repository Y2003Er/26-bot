import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { Config } from '../lib/handler.js';

const MAX_SIZE = 100 * 1024 * 1024; // 100MB
const DOWNLOAD_TIMEOUT = 5 * 60 * 1000; // dakika 5

export default {
    name: 'dl',
    alias: ['download'],
    desc: 'Pakua file yoyote kutoka link',
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
            return m.reply('❌ Tafadhali weka link ya kupakua\nMfano: .dl https://link.com/file.zip');
        }

        const url = args[0];
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        } catch {
            return m.reply('❌ Link uliyoweka si sahihi (invalid URL)');
        }

        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            return m.reply('❌ Aina hii ya link haiungwi mkono. Tumia http:// au https:// tu');
        }

        const hostname = parsedUrl.hostname.toLowerCase();
        const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '169.254.169.254'];
        const isPrivateIp = /^(10\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.|169\.254\.)/.test(hostname);

        if (blockedHosts.includes(hostname) || isPrivateIp || hostname.endsWith('.local')) {
            return m.reply('❌ Link hii haikubaliki kwa sababu za kiusalama');
        }

        let fileName = path.basename(parsedUrl.pathname.split('?')[0]);
        if (!fileName || fileName.length < 3 || !fileName.includes('.')) {
            fileName = `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        }
        fileName = fileName.replace(/[/\\?%*:|"<>]/g, '_');

        const downloadsDir = path.resolve('./downloads');
        const filePath = path.join(downloadsDir, fileName);

        if (!filePath.startsWith(downloadsDir)) {
            return m.reply('❌ Jina la faili si sahihi');
        }

        let writer;
        let response;
        let downloadTimer;

        try {
            await m.reply('⏳ *Inapakua...*\nTafadhali subiri kidogo');

            if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

            const controller = new AbortController();
            downloadTimer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);

            response = await axios({
                url,
                method: 'GET',
                responseType: 'stream',
                timeout: DOWNLOAD_TIMEOUT,
                maxRedirects: 5,
                maxContentLength: MAX_SIZE,
                signal: controller.signal,
                headers: { 'User-Agent': 'Mozilla/5.0' },
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
                if (downloaded > MAX_SIZE && !aborted) {
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
            if (writer && !writer.destroyed) writer.destroy();
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