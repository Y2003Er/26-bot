import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { Config } from '../lib/handler.js';

const MAX_SIZE = 100 * 1024 * 1024;
const DOWNLOAD_TIMEOUT = 5 * 60 * 1000;

export default {
    name: 'dl',
    alias: ['download'],
    desc: 'Pakua file yoyote. Sasa inavunja 5modapk pia',
    category: 'tools',
    use: '.dl <link>',
    async execute(sock, msg, args) {
        const m = {
            chat: msg.key.remoteJid,
            reply: async (txt) => await sock.sendMessage(msg.key.remoteJid, { text: txt }, { quoted: msg })
        };

        if (!args[0]) return m.reply('❌ Weka link ya kupakua');

        let url = args[0];
        const downloadsDir = path.resolve('./downloads');
        let filePath = null;
        let browser = null;

        try {
            await m.reply('⏳ *Inachanganua link...*');
            if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

            let downloadUrl = url;
            let fileName = `file_${Date.now()}.bin`;

            // KAMA NI 5MODAPK / GETMODSAPK - TUMIA PUPPETEER
            if (url.includes('5modapk.com') || url.includes('getmodsapk.com')) {
                await m.reply('🤖 *Nimegundua 5modapk. Ninafungua browser...*');

                browser = await puppeteer.launch({
                    headless: 'new',
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                });
                const page = await browser.newPage();
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

                await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
                await m.reply('⏳ *Inasubiri matangazo...*');
                await new Promise(r => setTimeout(r, 5000)); // Subiri sekunde 5 za ad

                // Bonyeza button ya Download
                const downloadBtn = await page.$('a.btn, a#downloadButton, a[href*=".apk"]');
                if (!downloadBtn) throw new Error('Sikupata button ya Download kwenye ukurasa');

                await m.reply('🖱️ *Inabonyeza Download...*');
                const [response] = await Promise.all([
                    page.waitForNavigation({ waitUntil: 'networkidle2' }),
                    downloadBtn.click()
                ]);

                downloadUrl = page.url();
                fileName = downloadUrl.split('/').pop().split('?')[0];
                fileName = fileName.replace(/[/\\?%*:|"<>]/g, '_');
                await m.reply(`📎 *Link halisi:* ${downloadUrl}`);
            }

            // KAMA NI MEDIAFIRE
            if (url.includes('mediafire.com')) {
                await m.reply('📎 *Nimegundua MediaFire. Ninavunja link...*');
                const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                const $ = cheerio.load(data);
                downloadUrl = $('a#downloadButton').attr('href');
                fileName = $('div.filename').text().trim() || fileName;
            }

            filePath = path.join(downloadsDir, fileName);
            await m.reply(`📥 *Inapakua:* ${fileName}`);

            const response = await axios({
                url: downloadUrl,
                method: 'GET',
                responseType: 'stream',
                timeout: DOWNLOAD_TIMEOUT,
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.google.com/' }
            });

            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);
            await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });

            const stats = fs.statSync(filePath);
            const fileSize = (stats.size / 1024 / 1024).toFixed(2);

            await m.reply(`✅ *Imeisha!* ${fileSize} MB\n📤 Inatuma...`);

            await sock.sendMessage(m.chat, {
                document: fs.readFileSync(filePath),
                fileName: fileName,
                mimetype: 'application/octet-stream'
            }, { quoted: msg });

        } catch (e) {
            console.error('[dl] Error:', e);
            await m.reply(`❌ *Imeshindwa*\nSababu: ${e.message}`);
        } finally {
            if (browser) await browser.close();
            if (filePath && fs.existsSync(filePath)) {
                try { fs.unlinkSync(filePath); } catch {}
            }
        }
    }
};