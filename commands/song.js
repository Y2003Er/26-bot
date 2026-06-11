/**
 * commands/song.js
 * Download wimbo (Audio MP3) kutoka YouTube — Fixed Version [26-TECH]
 */

import yts from 'yt-search';
import ytDlp from 'yt-dlp-exec';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const name        = 'song';
export const description = 'Download wimbo (MP3) kutoka YouTube kupitia YT-DLP Exec';
export const category    = 'media';
export const use         = '<jina la wimbo au link>';
export const alias       = ['play', 'music', 'mp3'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(from, {
            text: `❌ Tafadhali andika jina la wimbo au uweke link.\nMfano: .song Mbosso Pawa`
        }, { quoted: msg });
    }

    let tempFilePath = '';

    try {
        await sock.sendMessage(from, { text: '⏳ *Natafuta na kuandaa wimbo wako, subiri kidogo...*' }, { quoted: msg });

        let videoUrl      = '';
        let videoTitle    = '';
        let videoAuthor   = '';
        let videoDuration = '';
        let videoThumb    = '';

        const getThumb = (v) => {
            if (!v) return '';
            if (typeof v.thumbnail === 'string' && v.thumbnail.startsWith('http')) return v.thumbnail;
            if (typeof v.thumbnail === 'object' && v.thumbnail !== null) {
                return v.thumbnail.hqDefault || v.thumbnail.mqDefault || v.thumbnail.sdDefault || '';
            }
            if (typeof v.image === 'string' && v.image.startsWith('http')) return v.image;
            try {
                const id = new URL(v.url).searchParams.get('v');
                if (id) return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
            } catch (_) {}
            return '';
        };

        // 1. Tafuta Video kwenye YouTube
        if (text.startsWith('http://') || text.startsWith('https://')) {
            videoUrl = text;
            try {
                const sl = await yts(text);
                if (sl?.videos?.length > 0) {
                    const v = sl.videos[0];
                    videoTitle    = v.title;
                    videoAuthor   = v.author?.name || v.author || '';
                    videoDuration = v.timestamp || '';
                    videoThumb    = getThumb(v);
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
                return await sock.sendMessage(from, { text: '❌ Wimbo haujapatikana!' }, { quoted: msg });
            }
            const v = videos[0];
            videoUrl      = v.url;
            videoTitle    = v.title;
            videoAuthor   = v.author?.name || v.author || '';
            videoDuration = v.timestamp || '';
            videoThumb    = getThumb(v);
        }

        const finalTitle    = videoTitle  || 'Audio';
        const finalAuthor   = videoAuthor || 'Haijulikani';
        const finalDuration = videoDuration || '--:--';

        // Kikomo cha urefu
        if (finalDuration && finalDuration !== '--:--') {
            const parts = finalDuration.split(':');
            if (parts.length > 2) {
                return await sock.sendMessage(from, {
                    text: '❌ Wimbo mrefu sana. Tafadhali weka wimbo chini ya dakika 12.'
                }, { quoted: msg });
            }
            const mins = parseInt(parts[0]);
            if (!isNaN(mins) && mins > 12) {
                return await sock.sendMessage(from, {
                    text: '❌ Wimbo unazidi dakika 12. Tafadhali omba wimbo mfupi.'
                }, { quoted: msg });
            }
        }

        // Tuma Thumbnail
        if (videoThumb && typeof videoThumb === 'string' && videoThumb.startsWith('http')) {
            try {
                await sock.sendMessage(from, {
                    image: { url: videoThumb },
                    caption: `🎵 *${finalTitle}*\n👤 *Msanii:* ${finalAuthor}\n⏱️ *Muda:* ${finalDuration}\n\n📥 *Napakua kutoka YouTube [YT-DLP]...*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
                }, { quoted: msg });
            } catch (_) {}
        }

        // Path ya cookies.txt — absolute path kutoka root ya project
        const cookiesTxt = path.resolve(__dirname, '../cookies.txt');

        const uniqueId       = Date.now();
        const outputTemplate = path.join(os.tmpdir(), `ytdlp_${uniqueId}`);

        // ✅ FIXED: Removed preferFreeFormats conflict, added format: bestaudio/best
        const ytDlpArgs = {
            extractAudio:        true,
            audioFormat:         'mp3',
            audioQuality:        '0',
            output:              outputTemplate,
            noCheckCertificates: true,
            noWarnings:          true,
            format:              'bestaudio/best',
            addHeader:           [
                'referer:youtube.com',
                'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            ],
        };

        if (fs.existsSync(cookiesTxt)) {
            ytDlpArgs.cookies = cookiesTxt;
            console.log(`✅ [26-TECH] YT-DLP: cookies.txt imepachikwa (${cookiesTxt})`);
        } else {
            console.warn(`⚠️ [26-TECH] cookies.txt haipatikani: ${cookiesTxt} — inaendelea bila cookies.`);
        }

        console.log(`🔄 [26-TECH] YT-DLP inapakua: ${videoUrl}`);
        await ytDlp(videoUrl, ytDlpArgs);

        // Tafuta faili halisi lililoundwa
        const tmpFiles = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith(`ytdlp_${uniqueId}`));
        if (tmpFiles.length === 0) throw new Error('Faili la MP3 halijaundwa na yt-dlp');
        tempFilePath = path.join(os.tmpdir(), tmpFiles[0]);

        const fileSize = fs.statSync(tempFilePath).size;
        if (fileSize === 0) throw new Error('Faili la MP3 lipo lakini ni tupu');

        console.log(`✅ [26-TECH] Faili lipo: ${tempFilePath} (${(fileSize / 1024 / 1024).toFixed(2)} MB) — linatumwa...`);

        await sock.sendMessage(from, {
            audio:    { url: tempFilePath },
            mimetype: 'audio/mpeg',
            fileName: `${finalTitle.replace(/[^\w\s-]/g, '').trim() || 'audio'}.mp3`,
            ptt:      false
        }, { quoted: msg });

        console.log('✅ [26-TECH] Kazi imekamilika!');

    } catch (error) {
        console.error('YT-DLP Fatal Error:', error);

        let errMsg = '❌ Hitilafu ya YT-DLP: Imeshindwa kukamilisha maombi.';
        const stderr = error?.stderr || '';
        const stdout = error?.stdout || '';
        const allOutput = stderr + stdout;

        if (allOutput.includes('Sign in') || allOutput.includes('bot')) {
            errMsg = '❌ YouTube inahitaji uthibitisho. Cookies zimekwisha muda au hazipo.';
        } else if (allOutput.includes('Cookies file must be Netscape') || allOutput.includes('Netscape')) {
            errMsg = '❌ Cookies ziko katika muundo mbaya. Zinahitaji kuwa Netscape format.';
        } else if (allOutput.includes('Requested format is not available')) {
            errMsg = '❌ Format haipatikani kwa wimbo huu. Jaribu tena au tafuta wimbo mwingine.';
        } else if (allOutput.includes('Video unavailable') || allOutput.includes('Private video')) {
            errMsg = '❌ Video hii haipatikani au imefungwa.';
        } else if (allOutput.includes('ffmpeg') || allOutput.includes('ffprobe')) {
            errMsg = '❌ ffmpeg haipo kwenye server. Wasiliana na admin.';
        } else if (error?.code === 'ENOENT') {
            errMsg = '❌ YT-DLP binary haipatikani. Rejesha container upya.';
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
