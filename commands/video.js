/**
 * commands/video.js
 * Download video kutoka YouTube — No ffmpeg required [26-TECH]
 */

import yts from 'yt-search';
import ytDlp from 'yt-dlp-exec';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const name = 'video';
export const description = 'Download video kutoka YouTube kupitia YT-DLP Exec';
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

        const getThumb = (v) => {
            if (!v) return '';
            if (typeof v.thumbnail === 'string' && v.thumbnail.startsWith('http')) return v.thumbnail;
            try {
                const id = new URL(v.url).searchParams.get('v');
                if (id) return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
            } catch (_) {}
            return '';
        };

        if (text.startsWith('http://') || text.startsWith('https://')) {
            videoUrl = text;
            try {
                const sl = await yts(text);
                if (sl?.videos?.length > 0) {
                    const v = sl.videos[0];
                    videoTitle = v.title;
                    videoAuthor = v.author?.name || v.author || '';
                    videoDuration = v.timestamp || '';
                    videoThumb = getThumb(v);
                }
            } catch (_) {}
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
            videoThumb = getThumb(v);
        }

        const finalTitle = videoTitle || 'Video';
        const finalAuthor = videoAuthor || 'Haijulikani';
        const finalDuration = videoDuration || '--:--';

        if (videoThumb && typeof videoThumb === 'string' && videoThumb.startsWith('http')) {
            try {
                await sock.sendMessage(from, {
                    image: { url: videoThumb },
                    caption: `🎬 *${finalTitle}*\n👤 *${finalAuthor}*\n⏱️ *${finalDuration}*\n\n📥 *Napakua...*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
                }, { quoted: msg });
            } catch (_) {}
        }

        const uniqueId = Date.now();
        const outputTemplate = path.join(os.tmpdir(), `ytdlp_vid_${uniqueId}.%(ext)s`);
        const cookiesTxt = path.resolve(__dirname, '../cookies.txt');

        let options = {
            output: outputTemplate,
            noCheckCertificates: true,
            noWarnings: true,
            extractorArgs: 'youtube:player_client=android',
            addHeader: [
                'referer:youtube.com',
                'user-agent:Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36'
            ],
            format: 'best/worst/best'
        };

        if (fs.existsSync(cookiesTxt)) {
            options.cookies = cookiesTxt;
        }

        const execOptions = {
            executablePath: '/app/node_modules/yt-dlp-exec/bin/yt-dlp'
        };

        let downloaded = false;

        try {
            console.log(`🔄 [26-TECH] Kupakua video: ${videoUrl}`);
            await ytDlp(videoUrl, options, execOptions);
            downloaded = true;
        } catch (e1) {
            console.warn(`⚠️ Try 1 failed, trying worst format...`);
            delete options.cookies;
            options.format = 'worst/best';
            try {
                await ytDlp(videoUrl, options, execOptions);
                downloaded = true;
            } catch (e2) {
                throw e2;
            }
        }

        if (downloaded) {
            const tmpFiles = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith(`ytdlp_vid_${uniqueId}`));
            if (tmpFiles.length > 0) {
                tempFilePath = path.join(os.tmpdir(), tmpFiles[0]);
            }
        }

        if (!tempFilePath || !fs.existsSync(tempFilePath)) {
            throw new Error('Download imeshindwa');
        }

        const fileSize = fs.statSync(tempFilePath).size;

        if (fileSize > 60 * 1024 * 1024) {
            fs.unlinkSync(tempFilePath);
            return await sock.sendMessage(from, {
                text: '❌ Video kubwa sana. WhatsApp hairuhusu zaidi ya 60MB.'
            }, { quoted: msg });
        }

        await sock.sendMessage(from, {
            video: { url: tempFilePath },
            caption: `🎬 *${finalTitle}*\n👤 *${finalAuthor}*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`,
            mimetype: 'video/mp4'
        }, { quoted: msg });

    } catch (error) {
        console.error('YT-DLP Video Fatal Error:', error);
        await sock.sendMessage(from, { 
            text: '❌ Imeshindwa kupakua. Video hii inaweza kuwa private au inahitaji cookies mpya.' 
        }, { quoted: msg });
    } finally {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
            } catch (_) {}
        }
    }
}