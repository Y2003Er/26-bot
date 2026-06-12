/**
 * commands/video.js
 * Download video kwa @distube/ytdl-core
 */

import yts from 'yt-search';
import ytdl from '@distube/ytdl-core';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const name = 'video';
export const description = 'Download video kutoka YouTube';
export const category = 'media';
export const use = '<jina la video au link>';
export const alias = ['ytvideo', 'mp4'];
export const adminOnly = false;

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(from, {
            text: `❌ Tafadhali andika jina la video au uweke link.\nMfano:.video Marioo Watu`
        }, { quoted: msg });
    }

    let tempFilePath = '';

    try {
        await sock.sendMessage(from, { text: '⏳ *Natafuta na kuandaa video yako...*' }, { quoted: msg });

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
                return await sock.sendMessage(from, { text: '❌ Video haijapatikana!' }, { quoted: msg });
            }
            const v = videos[0];
            videoUrl = v.url;
            videoTitle = v.title;
            videoAuthor = v.author?.name || v.author || '';
            videoDuration = v.timestamp || '';
            videoThumb = v.thumbnail;
        }

        if (videoThumb) {
            await sock.sendMessage(from, {
                image: { url: videoThumb },
                caption: `🎬 *${videoTitle}*\n👤 *${videoAuthor}*\n⏱️ *${videoDuration}*\n\n📥 *Napakua...*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
            }, { quoted: msg });
        }

        tempFilePath = path.join(os.tmpdir(), `${Date.now()}.mp4`);

        const stream = ytdl(videoUrl, {
            quality: '18', // 360p, ndogo na haraka
            highWaterMark: 1 << 25
        });

        const writeStream = fs.createWriteStream(tempFilePath);
        stream.pipe(writeStream);

        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            stream.on('error', reject);
            writeStream.on('error', reject);
        });

        const fileSize = fs.statSync(tempFilePath).size;

        if (fileSize > 60 * 1024 * 1024) {
            fs.unlinkSync(tempFilePath);
            return await sock.sendMessage(from, {
                text: '❌ Video kubwa sana. WhatsApp hairuhusu zaidi ya 60MB.'
            }, { quoted: msg });
        }

        await sock.sendMessage(from, {
            video: { url: tempFilePath },
            caption: `🎬 *${videoTitle}*\n👤 *${videoAuthor}*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`,
            mimetype: 'video/mp4'
        }, { quoted: msg });

    } catch (error) {
        console.error('YTDL Video Fatal Error:', error);
        await sock.sendMessage(from, {
            text: '❌ Imeshindwa kupakua. Video hii inaweza kuwa private au age restricted.'
        }, { quoted: msg });
    } finally {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
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