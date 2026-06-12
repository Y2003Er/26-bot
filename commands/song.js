import yts from 'yt-search';
import ytdl from 'yt-dlp-exec';
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

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const text = args.join(' ').trim();
    if (!text) return await sock.sendMessage(from, { text: '❌ Andika jina la wimbo' }, { quoted: msg });

    try {
        await sock.sendMessage(from, { text: '⏳ *Natafuta...*' }, { quoted: msg });

        let videoUrl, videoId, videoTitle, videoAuthor, videoThumb;

        if (text.startsWith('http')) {
            videoUrl = text;
            videoId = videoUrl.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1];
        } else {
            const { videos } = await yts(text);
            if (!videos?.length) return await sock.sendMessage(from, { text: '❌ Haikupatikana' }, { quoted: msg });
            const v = videos[0];
            videoUrl = v.url;
            videoId = v.videoId;
            videoTitle = v.title;
            videoAuthor = v.author?.name || '';
            videoThumb = v.thumbnail;
        }

        const cacheFile = path.join(cacheDir, `${videoId}.m4a`);
        if (fs.existsSync(cacheFile)) {
            return await sendAudio(sock, from, msg, cacheFile, videoTitle);
        }

        let tempFilePath = path.join(os.tmpdir(), `${Date.now()}.m4a`);
        let downloaded = false;

        // Jaribu Invidious kwanza
        try {
            await downloadFromInvidious(videoId, tempFilePath);
            downloaded = true;
        } catch (e) {
            console.log('Invidious failed, falling back to yt-dlp');
        }

        // Fallback: yt-dlp
        if (!downloaded) {
            await downloadWithYtdlp(videoUrl, tempFilePath);
        }

        fs.copyFileSync(tempFilePath, cacheFile);
        await sendAudio(sock, from, msg, tempFilePath, videoTitle);

        if (!tempFilePath.includes('ytdlp_cache')) fs.unlinkSync(tempFilePath);

    } catch (error) {
        console.error('Song Error:', error.message);
        await sock.sendMessage(from, { text: '❌ Imeshindwa kupakua. Jaribu wimbo mwingine.' }, { quoted: msg });
    }
}

async function downloadFromInvidious(videoId, outputPath) {
    for (let instance of INVIDIOUS_INSTANCES) {
        try {
            const { data } = await axios.get(`${instance}/api/v1/videos/${videoId}`, { timeout: 8000 });
            const audioUrl = data.adaptiveFormats.find(f => f.type.includes('audio/mp4'))?.url;
            if (!audioUrl) continue;

            const response = await axios.get(audioUrl, { responseType: 'stream', timeout: 60000 });
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
        format: 'worstaudio/140',
        noCheckCertificates: true,
        noWarnings: true,
        cookies: './cookies.txt',
        extractorArgs: 'youtube:player_client=android',
        addHeader: ['referer:youtube.com', 'user-agent:Mozilla/5.0']
    });
}

async function sendAudio(sock, from, msg, filePath, title) {
    try {
        await sock.sendMessage(from, {
            audio: { url: filePath },
            mimetype: 'audio/mp4',
            fileName: `${title || 'audio'}.m4a`
        }, { quoted: msg });
    } catch {
        await sock.sendMessage(from, {
            document: { url: filePath },
            mimetype: 'audio/mp4',
            fileName: `${title || 'audio'}.m4a`
        }, { quoted: msg });
    }
}