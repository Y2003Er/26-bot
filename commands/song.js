import axios from 'axios';
import yts from 'yt-search';
import APIs from '../api.js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';

// ✅ Waambia fluent-ffmpeg iko wapi ffmpeg binary
ffmpeg.setFfmpegPath(ffmpegStatic);

// ✅ Convert buffer kwenda mp3 clean
async function convertToMp3(inputBuffer) {
    return new Promise((resolve, reject) => {
        const tmpInput = path.join(os.tmpdir(), `input_${Date.now()}`);
        const tmpOutput = path.join(os.tmpdir(), `output_${Date.now()}.mp3`);

        // Andika buffer kwenye temp file
        fs.writeFileSync(tmpInput, inputBuffer);

        ffmpeg(tmpInput)
            .setFfmpegPath(ffmpegStatic)
            .audioCodec('libmp3lame')
            .audioBitrate('128k')
            .audioFrequency(44100)
            .audioChannels(2)
            .format('mp3')
            .on('end', () => {
                try {
                    const outputBuffer = fs.readFileSync(tmpOutput);
                    // Cleanup temp files
                    fs.unlinkSync(tmpInput);
                    fs.unlinkSync(tmpOutput);
                    resolve(outputBuffer);
                } catch (e) {
                    reject(e);
                }
            })
            .on('error', (err) => {
                // Cleanup on error
                try { fs.unlinkSync(tmpInput); } catch (_) {}
                try { fs.unlinkSync(tmpOutput); } catch (_) {}
                reject(err);
            })
            .save(tmpOutput);
    });
}

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

            // Thumbnail + info
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

            // Fallback chain: EliteProTech → Yupra → Okatsu → Izumi
            let audioData;
            try {
                audioData = await APIs.getEliteProTechDownloadByUrl(url);
            } catch (e1) {
                console.error('[PLAY] EliteProTech failed:', e1.message);
                try {
                    audioData = await APIs.getYupraDownloadByUrl(url);
                } catch (e2) {
                    console.error('[PLAY] Yupra failed:', e2.message);
                    try {
                        audioData = await APIs.getOkatsuDownloadByUrl(url);
                    } catch (e3) {
                        console.error('[PLAY] Okatsu failed:', e3.message);
                        audioData = await APIs.getIzumiDownloadByUrl(url);
                    }
                }
            }

            // Download raw buffer
            const audioRes = await axios.get(audioData.download, {
                responseType: 'arraybuffer',
                timeout: 120000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const rawBuffer = Buffer.from(audioRes.data);
            const finalTitle = audioData.title || title;
            const finalThumb = audioData.thumbnail || thumbnail;

            // ✅ Convert to clean mp3 before sending
            console.log(`[PLAY] Converting: ${finalTitle}`);
            const audioBuffer = await convertToMp3(rawBuffer);
            console.log(`[PLAY] Converted successfully — ${audioBuffer.length} bytes`);

            // Send audio
            await sock.sendMessage(msg.key.remoteJid, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                ptt: false,
                fileName: `${finalTitle}.mp3`,
                contextInfo: {
                    externalAdReply: {
                        showAdAttribution: true,
                        mediaType: 2,
                        mediaUrl: url,
                        title: finalTitle,
                        body: '⚡ Powered by 26-𝐓𝐄𝐂𝐇',
                        sourceUrl: url,
                        thumbnailUrl: finalThumb,
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