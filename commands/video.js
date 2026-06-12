import yts from 'yt-search';
import axios from 'axios';
import { cobaltDownload } from '../lib/cobalt.js';

const videoCommand = {
    name: 'video',
    alias: ['vid', 'video'],
    description: 'Download video from YouTube',
    category: 'downloader',
    use: '<jina au link>',
    ownerOnly: false,
    adminOnly: false,
    execute: async (sock, msg, args) => {
        const from = msg.key.remoteJid;
        const text = args.join(' ').trim();

        if (!text) {
            return await sock.sendMessage(from, {
                text: '❌ Andika jina la video\nMfano: .video one dance'
            }, { quoted: msg });
        }

        try {
            await sock.sendMessage(from, {
                react: { text: '⏳', key: msg.key }
            });

            let videoUrl;
            let videoTitle = text;

            if (text.startsWith('http')) {
                videoUrl = text;
            } else {
                const { videos } = await yts(text);
                if (!videos?.length) {
                    return await sock.sendMessage(from, {
                        text: '❌ Video haikupatikana, jaribu jina jengine.'
                    }, { quoted: msg });
                }
                videoUrl = videos[0].url;
                videoTitle = videos[0].title;
            }

            // ✅ Use updated Cobalt helper
            const downloadUrl = await cobaltDownload(videoUrl, false);

            const videoRes = await axios.get(downloadUrl, {
                responseType: 'arraybuffer',
                timeout: 120000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const videoBuffer = Buffer.from(videoRes.data);

            await sock.sendMessage(from, {
                video: videoBuffer,
                mimetype: 'video/mp4',
                caption: `🎬 *${videoTitle}*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`,
                fileName: `${videoTitle}.mp4`
            }, { quoted: msg });

            await sock.sendMessage(from, {
                react: { text: '✅', key: msg.key }
            });

        } catch (error) {
            console.error('Video Error:', error.message);
            await sock.sendMessage(from, {
                text: '❌ Imeshindwa kupakua video. Tafadhali jaribu tena.'
            }, { quoted: msg });
            try {
                await sock.sendMessage(from, {
                    react: { text: '❌', key: msg.key }
                });
            } catch (_) {}
        }
    }
};

export default videoCommand;