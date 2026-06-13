import axios from 'axios';
import yts from 'yt-search';
import APIs from '../api.js';

const songCommand = {
    name: 'song',
    alias: ['play', 'song', 'ytaudio'],
    description: 'Download audio from YouTube',
    category: 'downloader',
    use: '<jina au link>',
    ownerOnly: false,
    adminOnly: false,
    execute: async (sock, msg, args) => {
        const from = msg.key.remoteJid;
        const text = args.join(' ').trim();

        if (!text) {
            return await sock.sendMessage(from, {
                text: '❌ Andika jina la wimbo\nMfano:.song one dance'
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
                        text: '❌ Wimbo haukupatikana, jaribu jina jengine.'
                    }, { quoted: msg });
                }
                videoUrl = videos[0].url;
                videoTitle = videos[0].title;
                videoThumbnail = videos[0].thumbnail;
            }

            // Thumbnail + info
            try {
                const ytId = (videoUrl.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/) || [])[1];
                const thumb = videoThumbnail || (ytId? `https://i.ytimg.com/vi/${ytId}/sddefault.jpg` : null);
                if (thumb) {
                    await sock.sendMessage(from, {
                        image: { url: thumb },
                        caption: `✼ ••๑⋯ ❀ Y O U T U B E A U D I O ❀ ⋯⋅๑•• ✼
❏ Title: ${videoTitle}
❒ Link: ${videoUrl}
⊱─━━━━⊱༻●༺⊰━━━━─⊰`
                    }, { quoted: msg });
                }
            } catch (e) {}

            // Fallback chain: EliteProTech → Yupra → Okatsu
            let videoData;
            try {
                videoData = await APIs.getEliteProTechVideoByUrl(videoUrl);
            } catch (e1) {
                console.error('[SONG] EliteProTech failed:', e1.message);
                try {
                    videoData = await APIs.getYupraVideoByUrl(videoUrl);
                } catch (e2) {
                    console.error('[SONG] Yupra failed:', e2.message);
                    videoData = await APIs.getOkatsuVideoByUrl(videoUrl);
                }
            }

            const finalTitle = videoData.title || videoTitle;
            const finalThumb = videoData.thumbnail || videoThumbnail;

            // Tuma kama audio
            await sock.sendMessage(from, {
                audio: { url: videoData.download },
                mimetype: 'audio/mpeg',
                fileName: `${finalTitle}.mp3`,
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
            console.error('Song Error:', error.message);
            await sock.sendMessage(from, {
                text: '❌ Imeshindwa kupakua wimbo. Tafadhali jaribu tena.'
            }, { quoted: msg });
            try {
                await sock.sendMessage(from, {
                    react: { text: '❌', key: msg.key }
                });
            } catch (_) {}
        }
    }
};

export default songCommand;