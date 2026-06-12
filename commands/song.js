/**
 * commands/song.js
 * Download audio kwa @distube/ytdl-core + cache
 */

import yts from 'yt-search';
import ytdl from '@distube/ytdl-core';
import fs from 'fs';
import path from 'path';
import os from 'os';

const cacheDir = path.join(os.tmpdir(), 'ytdlp_cache');
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

export const name = 'song';
export const description = 'Download wimbo kutoka YouTube';
export const category = 'media';
export const use = '<jina la wimbo au link>';
export const alias = ['play', 'music', 'mp3'];
export const adminOnly = false;

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(from, {
            text: `❌ Tafadhali andika jina la wimbo au uweke link.\nMfano:.song Mbosso Pawa`
        }, { quoted: msg });
    }

    let tempFilePath = '';

    try {
        await sock.sendMessage(from, { text: '⏳ *Natafuta na kuandaa wimbo wako...*' }, { quoted: msg });

        let videoUrl = '';
        let videoTitle = '';
        let videoAuthor = '';
        let videoDuration = '';
        let videoThumb = '';

        if (text.startsWith('http')) {
            videoUrl = text;
            const info = await ytdl.getInfo(videoUrl);
            videoTitle = info.videoDetails.title;
            videoAuthor = info.videoDetails.author.name;
            videoDuration = formatTime(info.videoDetails.lengthSeconds);
            videoThumb = info.videoDetails.thumbnails[0]?.url;
        } else {
            const { videos } = await yts(text);
            if (!videos || videos.length === 0) {
                return await sock.sendMessage(from, { text: '❌ Wimbo haujapatikana!' }, { quoted: msg });
            }
            const v = videos[0];
            videoUrl = v.url;
            videoTitle = v.title;
            videoAuthor = v.author?.name || v.author || '';
            videoDuration = v.timestamp || '';
            videoThumb = v.thumbnail;
        }

        const videoId = ytdl.getVideoID(videoUrl);
        const cacheFile = path.join(cacheDir, `${videoId}.m4a`);

        // Check cache kwanza
        if (fs.existsSync(cacheFile)) {
            console.log('✅ [26-TECH] Imepatikana kwenye cache');
            tempFilePath = cacheFile;
        } else {
            if (videoThumb) {
                await sock.sendMessage(from, {
                    image: { url: videoThumb },
                    caption: `🎵 *${videoTitle}*\n👤 *${videoAuthor}*\n⏱️ *${videoDuration}*\n\n📥 *Napakua...*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
                }, { quoted: msg });
            }

            console.log(`🔄 [26-TECH] Kupakua: ${videoUrl}`);
            tempFilePath = path.join(os.tmpdir(), `${Date.now()}.m4a`);

            const stream = ytdl(videoUrl, {
                quality: 'lowestaudio',
                filter: 'audioonly',
                highWaterMark: 1 << 25
            });

            const writeStream = fs.createWriteStream(tempFilePath);
            stream.pipe(writeStream);

            await new Promise((resolve, reject) => {
                writeStream.on('finish', resolve);
                stream.on('error', reject);
                writeStream.on('error', reject);
            });

            fs.copyFileSync(tempFilePath, cacheFile);
        }

        const fileName = `${videoTitle.replace(/[^\w\s-]/g, '').trim() || 'audio'}.m4a`;

        // Jaribu kutuma kama audio, ikishindikana tuma kama document
        try {
            await sock.sendMessage(from, {
                audio: { url: tempFilePath },
                mimetype: 'audio/mp4',
                fileName: fileName,
                ptt: false
            }, { quoted: msg });
        } catch (sendErr) {
            await sock.sendMessage(from, {
                document: { url: tempFilePath },
                mimetype: 'audio/mp4',
                fileName: fileName,
                caption: `🎵 ${videoTitle}`
            }, { quoted: msg });
        }

    } catch (error) {
        console.error('YTDL Fatal Error:', error);
        await sock.sendMessage(from, {
            text: '❌ Imeshindwa kupakua. Jaribu wimbo mwingine au link nyingine.'
        }, { quoted: msg });
    } finally {
        if (tempFilePath && tempFilePath.includes(os.tmpdir()) &&!tempFilePath.includes('ytdlp_cache')) {
            try {
                fs.unlinkSync(tempFilePath);
            } catch (_) {}
        }
    }
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}