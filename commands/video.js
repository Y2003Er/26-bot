import yts from 'yt-search';
import axios from 'axios';

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

            // Search or use direct URL
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

            // ✅ Cobalt API — correct status values
            const cobaltRes = await axios.post(
                'https://api.cobalt.tools/api/json',
                {
                    url: videoUrl,
                    isAudioOnly: false,
                    vQuality: '360',   // ✅ correct param name
                    vFormat: 'mp4'     // ✅ correct param name
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    timeout: 60000
                }
            );

            const { status, url: downloadUrl } = cobaltRes.data;

            // ✅ Cobalt returns 'stream', 'redirect', or 'tunnel' on success — NOT 'success'
            if (!downloadUrl || !['stream', 'redirect', 'tunnel'].includes(status)) {
                throw new Error(`Cobalt API error: ${status} — ${cobaltRes.data?.text || 'unknown'}`);
            }

            // Download video buffer
            const videoRes = await axios.get(downloadUrl, {
                responseType: 'arraybuffer',
                timeout: 120000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const videoBuffer = Buffer.from(videoRes.data);

            // Send video
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