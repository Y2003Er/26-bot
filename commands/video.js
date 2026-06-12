/**
 * commands/video.js
 * Download video kwa Invidious + yt-dlp fallback
 */

import yts from 'yt-search';
import ytdl from 'yt-dlp-exec';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';

const INVIDIOUS_INSTANCES = [
    'https://invidious.privacydev.net',
    'https://iv.mint.lgbt',
    'https://invidious.io'
];

export const name = 'video';
export const description = 'Download video kutoka YouTube';
export const category = 'media';
export const use = '<jina la video au link>';
export const alias = ['ytvideo', 'mp4'];

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(from, { text: '❌ Andika jina la video au link' }, { quoted: msg });
    }

    let tempFilePath = '';

    try {
        await sock.sendMessage(from, { text: '⏳ *Natafuta na kuandaa video yako...*' }, { quoted: msg });

        let videoUrl, videoId, videoTitle, videoAuthor, videoThumb;

        if (text.startsWith('http')) {
            videoUrl = text;
            videoId = videoUrl.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1];
        } else {
            const { videos } = await yts(text);
            if (!videos?.length) {
                return await sock.sendMessage(from, { text: '❌ Video haijapatikana!' }, { quoted: msg });
            }
            const v = videos[0];
            videoUrl = v.url;
            videoId = v.videoId;
            videoTitle = v.title;
            videoAuthor = v.author?.name || '';
            videoThumb = v.thumbnail;
        }

        if (!videoId) throw new Error('Invalid video ID');

        tempFilePath = path.join(os.tmpdir(), `${Date.now()}.mp4`);
        let downloaded = false;

        // Jaribu Invidious kwanza
        try {
            await downloadFromInvidious(videoId, tempFilePath);
            downloaded = true;
            console.log('✅ Downloaded via Invidious');
        } catch (e) {
            console.log('Invidious failed, falling back to yt-dlp:', e.message);
        }

        // Fallback: yt-dlp
        if (!downloaded) {
            await downloadWithYtdlp(videoUrl, tempFilePath);
            console.log('✅ Downloaded via yt-dlp');
        }

        const fileSize = fs.statSync(tempFilePath).size;
        if (fileSize > 60 * 1024 * 1024) {
            fs.unlinkSync(tempFilePath);
            return await sock.sendMessage(from, {
                text: '❌ Video kubwa sana. WhatsApp hairuhusu zaidi ya 60MB.'
            }, { quoted: msg });
        }

        if (videoThumb) {
            await sock.sendMessage(from, {
                image: { url: videoThumb },
                caption: `🎬 *${videoTitle}*\n👤 *${videoAuthor}*\n\n📤 *Inatuma...*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
            }, { quoted: msg });
        }

        await sock.sendMessage(from, {
            video: { url: tempFilePath },
            caption: `🎬 *${videoTitle}*\n👤 *${videoAuthor}*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`,
            mimetype: 'video/mp4'
        }, { quoted: msg });

    } catch (error) {
        console.error('Video Error:', error.message);
        await sock.sendMessage(from, {
            text: '❌ Imeshindwa kupakua. Video hii inaweza kuwa private au age restricted.'
        }, { quoted: msg });
    } finally {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch (_) {}
        }
    }
}

async function downloadFromInvidious(videoId, outputPath) {
    for (let instance of INVIDIOUS_INSTANCES) {
        try {
            const { data } = await axios.get(`${instance}/api/v1/videos/${videoId}`, { timeout: 10000 });
            const videoUrl = data.adaptiveFormats.find(f =>
                f.type.includes('video/mp4') && f.qualityLabel === '360p'
            )?.url || data.adaptiveFormats.find(f => f.type.includes('video/mp4'))?.url;

            if (!videoUrl) continue;

            const response = await axios.get(videoUrl, { responseType: 'stream', timeout: 120000 });
            const writer = fs.createWriteStream(outputPath);
            response.data.pipe(writer);
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
            return;
        } catch (e) {}
    }
    throw new Error('Audio url not found');
}

async function downloadWithYtdlp(url, outputPath) {
    await ytdl(url, {
        output: outputPath,
        format: 'worst[height<=360]/18',
        noCheckCertificates: true,
        noWarnings: true,
        cookies: './cookies.txt',
        extractorArgs: 'youtube:player_client=android',
        addHeader: ['referer:youtube.com', 'user-agent:Mozilla/5.0']
    });
}