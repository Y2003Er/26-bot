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
            console.log('[SONG] Anza process kwa:', text);
            await sock.sendMessage(from, {
                react: { text: '⏳', key: msg.key }
            });

            let videoUrl;
            let videoDataYT;

            if (text.startsWith('http')) {
                videoUrl = text;
                console.log('[SONG] Ni link direct:', videoUrl);
                const { videos } = await yts({ videoId: videoUrl.split('v=')[1] });
                videoDataYT = videos[0];
            } else {
                console.log('[SONG] Tafuta kwenye YouTube:', text);
                const { videos } = await yts(text);
                if (!videos?.length) {
                    console.log('[SONG] Hakuna matokeo');
                    return await sock.sendMessage(from, {
                        text: '❌ Wimbo haukupatikana, jaribu jina jengine.'
                    }, { quoted: msg });
                }
                videoDataYT = videos[0];
                videoUrl = videoDataYT.url;
            }

            console.log('[SONG] Video kupakua:', videoDataYT.title, videoUrl);

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
                console.log('[SONG] Thumbnail imetumwa');
            } catch (e) {
                console.log('[SONG] Thumbnail failed:', e.message);
            }

            // Fallback chain: EliteProTech → Yupra → Okatsu
            let videoData;
            try {
                console.log('[SONG] Jaribu EliteProTech...');
                videoData = await APIs.getEliteProTechVideoByUrl(videoUrl);
                console.log('[SONG] ✅ EliteProTech imefanikiwa');
            } catch (e1) {
                console.error('[SONG] ❌ EliteProTech failed:', e1.message);
                try {
                    console.log('[SONG] Jaribu Yupra...');
                    videoData = await APIs.getYupraVideoByUrl(videoUrl);
                    console.log('[SONG] ✅ Yupra imefanikiwa');
                } catch (e2) {
                    console.error('[SONG] ❌ Yupra failed:', e2.message);
                    console.log('[SONG] Jaribu Okatsu...');
                    videoData = await APIs.getOkatsuVideoByUrl(videoUrl);
                    console.log('[SONG] ✅ Okatsu imefanikiwa');
                }
            }

            const finalTitle = videoData.title || videoDataYT.title;
            const finalThumb = videoData.thumbnail || videoDataYT.thumbnail;
            console.log('[SONG] Download URL:', videoData.download);

            // Jaribu kutuma kama audio, ikishindwa tuma kama file
            try {
                console.log('[SONG] Tuma kama audio...');
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
                console.log('[SONG] ✅ Audio imetumwa');
            } catch (err) {
                console.error('[SONG] ❌ Audio failed:', err.message);
                console.log('[SONG] Tuma kama document...');
                await sock.sendMessage(from, {
                    document: { url: videoData.download },
                    mimetype: 'audio/mpeg',
                    fileName: `${finalTitle}.mp3`,
                    caption: `🎵 ${finalTitle}`
                }, { quoted: msg });
                console.log('[SONG] ✅ Document imetumwa');
            }

            await sock.sendMessage(from, {
                react: { text: '✅', key: msg.key }
            });

        } catch (error) {
            console.error('[SONG] ❌ Error kubwa:', error.message);
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