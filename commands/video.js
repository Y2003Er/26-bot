import axios from 'axios';
import yts from 'yt-search';
import APIs from '../api.js';

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
            let videoThumbnail = '';

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
                videoThumbnail = videos[0].thumbnail;
            }

            // ✅ Thumbnail + info kama play.js
            try {
                const ytId = (videoUrl.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/) || [])[1];
                const thumb = videoThumbnail || (ytId ? `https://i.ytimg.com/vi/${ytId}/sddefault.jpg` : null);
                if (thumb) {
                    await sock.sendMessage(from, {
                        image: { url: thumb },
                        caption: `✼ ••๑⋯ ❀ Y O U T U B E ❀ ⋯⋅๑•• ✼
❏ Title: ${videoTitle}
❒ Link: ${videoUrl}
⊱─━━━━⊱༻●༺⊰━━━━─⊰`
                    }, { quoted: msg });
                }
            } catch (e) {}

            // ✅ Fallback chain: EliteProTech → Yupra → Okatsu
            let videoData;
            try {
                videoData = await APIs.getEliteProTechVideoByUrl(videoUrl);
            } catch (e1) {
                console.error('[VIDEO] EliteProTech failed:', e1.message);
                try {
                    videoData = await APIs.getYupraVideoByUrl(videoUrl);
                } catch (e2) {
                    console.error('[VIDEO] Yupra failed:', e2.message);
                    videoData = await APIs.getOkatsuVideoByUrl(videoUrl);
                }
            }

            const finalTitle = videoData.title || videoTitle;
            const finalThumb = videoData.thumbnail || videoThumbnail;

            // ✅ Audio appearance (si video player)
            await sock.sendMessage(from, {
                audio: { url: videoData.download },
                mimetype: 'audio/mp4',
                ptt: false,
                fileName: `${finalTitle}.mp4`,
                contextInfo: {
                    externalAdReply: {
                        showAdAttribution: true,
                        mediaType: 2,
                        mediaUrl: videoUrl,
                        title: finalTitle,
                        body: '⚡ Powered by 26-𝐓𝐄𝐂𝐇',
                        sourceUrl: videoUrl,
                        thumbnailUrl: finalThumb,
                    },
                },
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