/**
 * commands/video.js
 * Download video kutoka YouTube — Toleo la Kasi la 26-TECH
 */

import yts from 'yt-search';
import ytdlp from 'yt-dlp-exec';
import fs from 'fs';
import path from 'path';

export const name = 'video';
export const description = 'Download video kutoka YouTube kwa kasi ya juu';
export const category = 'media';
export const use = '<jina la video au link>';
export const alias = ['ytv', 'ytmp4', 'ytvid'];
export const adminOnly = false;

// hakikisha folder ya temp ipo
const TEMP_DIR = './temp';
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(from, {
            text: `❌ Tafadhali andika jina la video au uweke link ya YouTube.\nMfano:.video Alikiba New Song`
        }, { quoted: msg });
    }

    try {
        await sock.sendMessage(from, { text: '⏳ *Natafuta video...*' }, { quoted: msg });

        let videoUrl = '';
        let videoTitle = '';

        // 1. Pata link ya video
        if (text.startsWith('http://') || text.startsWith('https://')) {
            videoUrl = text;
            const searchLink = await yts(text);
            if (searchLink && searchLink.videos.length > 0) {
                videoTitle = searchLink.videos[0].title;
            }
        } else {
            const { videos } = await yts(text);
            if (!videos || videos.length === 0) {
                return await sock.sendMessage(from, { text: '❌ Video haijapatikana!' }, { quoted: msg });
            }
            videoUrl = videos[0].url;
            videoTitle = videos[0].title;
        }

        const safeTitle = videoTitle.replace(/[^\w\s-]/g, '').trim().slice(0, 50) || 'video';
        const outputPath = path.join(TEMP_DIR, `${Date.now()}_${safeTitle}.mp4`);

        await sock.sendMessage(from, { text: `⬇️ *Napakua: ${safeTitle}*\nSubiri kidogo...` }, { quoted: msg });

        // 2. Pakua kwa yt-dlp - hii ndio sehemu ya kasi
        await ytdlp(videoUrl, {
            format: 'best[height<=720][ext=mp4]/best[ext=mp4]/best',
            output: outputPath,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: ['referer:youtube.com', 'user-agent:Mozilla/5.0'],
            limitRate: '5M' // limit 5MB/s ili isilete ban
        });

        // 3. Check size - WhatsApp inaruhusu max 100MB
        const stats = fs.statSync(outputPath);
        if (stats.size > 95 * 1024 * 1024) {
            fs.unlinkSync(outputPath);
            return await sock.sendMessage(from, {
                text: '❌ Video ni kubwa sana. Max ni 95MB kwa WhatsApp.'
            }, { quoted: msg });
        }

        // 4. Tuma video
        await sock.sendMessage(from, {
            video: { url: outputPath },
            mimetype: 'video/mp4',
            fileName: `${safeTitle}.mp4`,
            caption: `🎬 *${videoTitle}*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
        }, { quoted: msg });

        // 5. Futa file baada ya kutuma
        fs.unlinkSync(outputPath);
        console.log(`✅ [26-TECH] Video imetumwa: ${safeTitle}`);

    } catch (error) {
        console.error('Video error:', error);
        await sock.sendMessage(from, { text: `❌ Hitilafu: ${error.message}` }, { quoted: msg });
    }
}
