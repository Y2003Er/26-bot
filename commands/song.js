/**
 * commands/song.js
 * Download audio kwa Invidious API - inafanya kazi 100% kwenye Railway
 */

import yts from 'yt-search';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';

const cacheDir = path.join(os.tmpdir(), 'ytdlp_cache');
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

const INVIDIOUS_INSTANCES = [
    'https://invidious.privacydev.net',
    'https://iv.mint.lgbt',
    'https://invidious.io'
];

export const name = 'song';
export const description = 'Download wimbo kutoka YouTube';
export const category = 'media';
export const use = '<jina la wimbo au link>';
export const alias = ['play', 'music', 'mp3'];

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(from, { text: '❌ Andika jina la wimbo au link' }, { quoted: msg });
    }

    let tempFilePath = '';

    try {
        await sock.sendMessage(from, { text: '⏳ *Natafuta na kuandaa wimbo wako...*' }, { quoted: msg });

        let videoUrl, videoId, videoTitle, videoAuthor, videoDuration, videoThumb;

        if (text.startsWith('http')) {
            videoUrl = text;
            videoId = videoUrl.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1];
        } else {
            const { videos } = await yts(text);
            if (!videos?.length) return await sock.sendMessage(from, { text: '❌ Wimbo haujapatikana!' }, { quoted: msg });
            const v = videos[0];
            videoUrl = v.url;
            videoId = v.videoId;
            videoTitle = v.title;
            videoAuthor = v.author?.name || '';
            videoDuration = v.timestamp || '';
            videoThumb = v.thumbnail;
        }

        if (!videoId) throw new Error('Invalid video ID');

        // Check cache
        const cacheFile = path.join(cacheDir, `${videoId}.m4a`);
        if (fs.existsSync(cacheFile)) {
            tempFilePath = cacheFile;
            console.log('✅ Cache hit');
        } else {
            // Get audio URL kutoka Invidious
            let audioUrl = null;
            let info = null;

            for (let instance of INVIDIOUS_INSTANCES) {
                try {
                    const { data } = await axios.get(`${instance}/api/v1/videos/${videoId}`, { timeout: 10000 });
                    audioUrl = data.adaptiveFormats.find(f => f.type.includes('audio/mp4'))?.url;
                    if (audioUrl) {
                        info = data;
                        break;
                    }
                } catch (e) {}
            }

            if (!audioUrl) throw new Error('Audio URL not found');

            videoTitle = videoTitle || info.title;
            videoAuthor = videoAuthor || info.author;
            videoDuration = videoDuration || formatTime(info.lengthSeconds);
            videoThumb = videoThumb || info.videoThumbnails[0]?.url;

            if (videoThumb) {
                await sock.sendMessage(from, {
                    image: { url: videoThumb },
                    caption: `🎵 *${videoTitle}*\n👤 *${videoAuthor}*\n⏱️ *${videoDuration}*\n\n📥 *Napakua...*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
                }, { quoted: msg });
            }

            tempFilePath = path.join(os.tmpdir(), `${Date.now()}.m4a`);
            const response = await axios.get(audioUrl, { responseType: 'stream', timeout: 60000 });
            const writer = fs.createWriteStream(tempFilePath);
            response.data.pipe(writer);
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            fs.copyFileSync(tempFilePath, cacheFile);
        }

        const fileName = `${videoTitle.replace(/[^\w\s-]/g, '').trim() || 'audio'}.m4a`;

        await sock.sendMessage(from, {
            audio: { url: tempFilePath },
            mimetype: 'audio/mp4',
            fileName: fileName
        }, { quoted: msg });

    } catch (error) {
        console.error('Song Error:', error.message);
        await sock.sendMessage(from, { text: '❌ Imeshindwa kupakua. Jaribu tena.' }, { quoted: msg });
    } finally {
        if (tempFilePath && tempFilePath.includes(os.tmpdir()) &&!tempFilePath.includes('ytdlp_cache')) {
            try { fs.unlinkSync(tempFilePath); } catch (_) {}
        }
    }
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}