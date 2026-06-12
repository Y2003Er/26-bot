import axios from 'axios';
import yts from 'yt-search';
import fs from 'fs';
import os from 'os';
import path from 'path';

const playCommand = {
    name: 'play',
    alias: ['song', 'wimbo'],
    description: 'Tafuta na upakue wimbo kutoka YouTube',
    category: 'downloader',
    use: '<jina la wimbo>',
    ownerOnly: false,
    adminOnly: false,
    execute: async (sock, msg, args) => {
        const text = args.join(' ');

        if (!text) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Tafadhali weka jina la wimbo.\n\nMfano: .play marioo unanionea`
            }, { quoted: msg });
        }

        try {
            await sock.sendMessage(msg.key.remoteJid, {
                react: { text: '⏳', key: msg.key }
            });
        } catch (e) {}

        try {
            // Search YouTube
            const search = await yts(`${text} Song`);
            if (!search.videos.length) {
                return await sock.sendMessage(msg.key.remoteJid, {
                    text: '❌ Wimbo haujapatikana, jaribu jina jengine.'
                }, { quoted: msg });
            }

            const vid = search.videos[0];
            const { title, thumbnail, timestamp, views, ago, url } = vid;

            // Send thumbnail + info first
            await sock.sendMessage(msg.key.remoteJid, {
                image: { url: thumbnail },
                caption: `✼ ••๑⋯ ❀ Y O U T U B E ❀ ⋯⋅๑•• ✼
❏ Title: ${title}
❐ Duration: ${timestamp}
❑ Views: ${views}
❒ Uploaded: ${ago}
❒ Link: ${url}
⊱─━━━━⊱༻●༺⊰━━━━─⊰`
            }, { quoted: msg });

            // ✅ Request download link from Cobalt API
            const cobaltRes = await axios.post(
                'https://api.cobalt.tools/api/json',
                {
                    url: url,
                    aFormat: 'mp3',
                    isAudioOnly: true,
                    disableMetadata: true
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    timeout: 30000
                }
            );

            const { status, url: downloadUrl } = cobaltRes.data;

            if (!downloadUrl || (status !== 'stream' && status !== 'redirect' && status !== 'tunnel')) {
                throw new Error(`Cobalt API returned unexpected status: ${status}`);
            }

            // ✅ Download audio buffer directly from Cobalt's CDN
            const audioRes = await axios.get(downloadUrl, {
                responseType: 'arraybuffer',
                timeout: 60000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const audioBuffer = Buffer.from(audioRes.data);

            // Send audio
            await sock.sendMessage(msg.key.remoteJid, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                ptt: false,
                fileName: `${title}.mp3`,
                contextInfo: {
                    externalAdReply: {
                        showAdAttribution: true,
                        mediaType: 2,
                        mediaUrl: url,
                        title: title,
                        body: 'HERE IS YOUR SONG 🎧',
                        sourceUrl: url,
                        thumbnailUrl: thumbnail,
                    },
                },
            }, { quoted: msg });

            await sock.sendMessage(msg.key.remoteJid, {
                react: { text: '✅', key: msg.key }
            });

        } catch (error) {
            console.error('Play command error:', error.message);
            await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Hitilafu imetokea wakati wa kupakua wimbo huo. Tafadhali jaribu tena.'
            }, { quoted: msg });
            try {
                await sock.sendMessage(msg.key.remoteJid, {
                    react: { text: '❌', key: msg.key }
                });
            } catch (_) {}
        }
    }
};

export default playCommand;