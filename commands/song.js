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
            let videoDataYT;

            if (text.startsWith('http')) {
                videoUrl = text;
                const { videos } = await yts({ videoId: videoUrl.split('v=')[1] });
                videoDataYT = videos[0];
            } else {
                const { videos } = await yts(text);
                if (!videos?.length) {
                    return await sock.sendMessage(from, {
                        text: '❌ Wimbo haukupatikana, jaribu jina jengine.'
                    }, { quoted: msg });
                }
                videoDataYT = videos[0];
                videoUrl = videoDataYT.url;
            }

            // Thumbnail + info
            try {
                await sock.sendMessage(from, {
                    image: { url: videoDataYT.thumbnail },
                    caption: `✼ ••๑⋯ ❀ Y O U T U B E ❀ ⋯⋅๑•• ✼
❏ Title: ${videoDataYT.title}
❐ Duration: ${videoDataYT.timestamp}
❑ Views: ${videoDataYT.views.toLocaleString()}
❒ Uploaded: ${videoDataYT.ago}
❒ Link: ${videoUrl}
⊱─━━━━⊱༻●༺⊰━━━━─⊰`
                }, { quoted: msg });
            } catch (e) {}

            // Fallback chain: EliteProTech → Yupra → Okatsu
            let videoData;
            try {
                videoData = await APIs.getEliteProTechVideoByUrl(videoUrl);
            } catch (e1) {
                console.error('EliteProTech failed:', e1.message);
                try {
                    videoData = await APIs.getYupraVideoByUrl(videoUrl);
                } catch (e2) {
                    console.error('Yupra failed:', e2.message);
                    videoData = await APIs.getOkatsuVideoByUrl(videoUrl);
                }
            }

            const finalTitle = videoData.title || videoDataYT.title;
            const finalThumb = videoData.thumbnail || videoDataYT.thumbnail;

            // Jaribu kutuma kama audio, ikishindwa tuma kama file
            try {
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
            } catch (err) {
                console.error('Audio send failed, sending as file:', err.message);
                await sock.sendMessage(from, {
                    document: { url: videoData.download },
                    mimetype: 'audio/mpeg',
                    fileName: `${finalTitle}.mp3`,
                    caption: `🎵 ${finalTitle}`
                }, { quoted: msg });
            }

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