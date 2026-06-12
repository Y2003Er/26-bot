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
        await sock.sendMessage(from, { text: '⏳ *Natafuta na kuandaa video yako, subiri kidogo...*' }, { quoted: msg });

        let videoUrl = '';
        let videoTitle = '';
        let videoAuthor = '';
        let videoDuration = '';
        let videoThumb = '';

        const getThumb = (v) => {
            if (!v) return '';
            if (typeof v.thumbnail === 'string' && v.thumbnail.startsWith('http')) return v.thumbnail;
            if (typeof v.thumbnail === 'object' && v.thumbnail!== null) {
                return v.thumbnail.hqDefault || v.thumbnail.mqDefault || v.thumbnail.sdDefault || '';
            }
            if (typeof v.image === 'string' && v.image.startsWith('http')) return v.image;
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
            if (!videoThumb) {
                try {
                    const id = new URL(videoUrl).searchParams.get('v');
                    if (id) videoThumb = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
                } catch (_) {}
            }
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

        // Limit dakika 5 ili isizidi 60MB ya WhatsApp
        if (finalDuration && finalDuration!== '--:--') {
            const parts = finalDuration.split(':');
            if (parts.length > 2) {
                return await sock.sendMessage(from, {
                    text: '❌ Video ndefu sana. Tafadhali weka video chini ya dakika 5.'
                }, { quoted: msg });
            }
            const mins = parseInt(parts[0]);
            if (!isNaN(mins) && mins > 5) {
                return await sock.sendMessage(from, {
                    text: '❌ Video inazidi dakika 5. Tafadhali omba video fupi.'
                }, { quoted: msg });
            }
        }

        if (videoThumb && typeof videoThumb === 'string' && videoThumb.startsWith('http')) {
            try {
                await sock.sendMessage(from, {
                    image: { url: videoThumb },
                    caption: `🎬 *${finalTitle}*\n👤 *Msanii:* ${finalAuthor}\n⏱️ *Muda:* ${finalDuration}\n\n📥 *Napakua kutoka YouTube [YT-DLP]...*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
                }, { quoted: msg });
            } catch (_) {}
        }

        const uniqueId = Date.now();
        const outputTemplate = path.join(os.tmpdir(), `ytdlp_vid_${uniqueId}.%(ext)s`);

        const options = {
            output: outputTemplate,
            noCheckCertificates: true,
            noWarnings: true,
            extractorArgs: 'youtube:player_client=ios,android',
            addHeader: [
                'referer:youtube.com',
                'user-agent:Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15'
            ],
            format: 'best[height<=720]/best'
        };

        // Ongeza cookies kama ipo
        const cookiesTxt = path.resolve(__dirname, '../cookies.txt');
        if (fs.existsSync(cookiesTxt)) {
            options.cookies = cookiesTxt;
            console.log(`✅ [26-TECH] Cookies imepachikwa kwa video`);
        } else {
            console.warn(`⚠️ [26-TECH] cookies.txt haipatikani`);
        }

        const execOptions = {
            executablePath: '/app/node_modules/yt-dlp-exec/bin/yt-dlp'
        };

        let downloaded = false;

        try {
            console.log(`🔄 [26-TECH] Kupakua video: ${videoUrl}`);
            await ytDlp(videoUrl, options, execOptions);

            const tmpFiles = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith(`ytdlp_vid_${uniqueId}`));
            if (tmpFiles.length > 0) {
                tempFilePath = path.join(os.tmpdir(), tmpFiles[0]);
                const sz = fs.statSync(tempFilePath).size;
                if (sz > 0) {
                    downloaded = true;
                    console.log(`✅ [26-TECH] Video imepatikana!`);
                }
            }
        } catch (e) {
            const msg2 = (e?.stderr || '') + (e?.stdout || '');
            console.warn(`⚠️ Imeshindwa: ${msg2.slice(0, 200)}`);
            throw e;
        }

        if (!downloaded ||!tempFilePath) {
            throw new Error('ALLFAILED: Download imeshindwa');
        }

        const fileExt = path.extname(tempFilePath).replace('.', '') || 'mp4';
        const fileSize = fs.statSync(tempFilePath).size;

        // WhatsApp limit 64MB
        if (fileSize > 60 * 1024 * 1024) {
            fs.unlinkSync(tempFilePath);
            return await sock.sendMessage(from, {
                text: '❌ Video kubwa sana. WhatsApp hairuhusu zaidi ya 60MB.'
            }, { quoted: msg });
        }

        console.log(`✅ [26-TECH] Video inatumwa: ${tempFilePath} | ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

        await sock.sendMessage(from, {
            video: { url: tempFilePath },
            caption: `🎬 *${finalTitle}*\n👤 *${finalAuthor}*`,
            mimetype: 'video/mp4'
        }, { quoted: msg });

        console.log('✅ [26-TECH] Video imetumwa!');

    } catch (error) {
        console.error('YT-DLP Video Fatal Error:', error);

        let errMsg = '❌ Hitilafu: Imeshindwa kupakua video hii.';
        const allOutput = (error?.stderr || '') + (error?.stdout || '') + (error?.message || '');

        if (allOutput.includes('Sign in') || allOutput.includes('bot')) {
            errMsg = '❌ YouTube imeblock. Weka cookies.txt kwenye bot.';
        } else if (allOutput.includes('format is not available')) {
            errMsg = '❌ Format haipatikani. Jaribu video nyingine.';
        } else if (allOutput.includes('Video unavailable') || allOutput.includes('Private video')) {
            errMsg = '❌ Video hii haipatikani au imefungwa.';
        }

        await sock.sendMessage(from, { text: errMsg }, { quoted: msg });

    } finally {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
                console.log('🗑️ [26-TECH] Faili la muda limefutwa.');
            } catch (_) {}
        }
    }
}