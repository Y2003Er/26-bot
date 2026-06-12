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