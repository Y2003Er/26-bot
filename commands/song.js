/**
 * commands/song.js
 * Download wimbo (Audio) kutoka YouTube — No ffmpeg required [26-TECH]
 */

import yts from 'yt-search';
import ytDlp from 'yt-dlp-exec';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const name = 'song';
export const description = 'Download wimbo (Audio) kutoka YouTube kupitia YT-DLP Exec';
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
        await sock.sendMessage(from, { text: '⏳ *Natafuta na kuandaa wimbo wako, subiri kidogo...*' }, { quoted: msg });

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
                return await sock.sendMessage(from, { text: '❌ Wimbo haujapatikana!' }, { quoted: msg });
            }
            const v = videos[0];
            videoUrl = v.url;
            videoTitle = v.title;
            videoAuthor = v.author?.name || v.author || '';
            videoDuration = v.timestamp || '';
            videoThumb = getThumb(v);
        }

        const finalTitle = videoTitle || 'Audio';
        const finalAuthor = videoAuthor || 'Haijulikani';
        const finalDuration = videoDuration || '--:--';

        if (finalDuration && finalDuration!== '--:--') {
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

        if (videoThumb && typeof videoThumb === 'string' && videoThumb.startsWith('http')) {
            try {
                await sock.sendMessage(from, {
                    image: { url: videoThumb },
                    caption: `🎵 *${finalTitle}*\n👤 *Msanii:* ${finalAuthor}\n⏱️ *Muda:* ${finalDuration}\n\n📥 *Napakua kutoka YouTube [YT-DLP]...*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
                }, { quoted: msg });
            } catch (_) {}
        }

        const uniqueId = Date.now();
        const outputTemplate = path.join(os.tmpdir(), `ytdlp_${uniqueId}.%(ext)s`);

        const options = {
            output: outputTemplate,
            noCheckCertificates: true,
            noWarnings: true,
            extractorArgs: 'youtube:player_client=ios,android',
            addHeader: [
                'referer:youtube.com',
                'user-agent:Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15'
            ],
            format: 'bestaudio/best'
        };

        const cookiesTxt = path.resolve(__dirname, '../cookies.txt');
        if (fs.existsSync(cookiesTxt)) {
            options.cookies = cookiesTxt;
            console.log(`✅ [26-TECH] Cookies imepachikwa`);
        }

        const execOptions = {
            executablePath: '/app/node_modules/yt-dlp-exec/bin/yt-dlp'
        };

        let downloaded = false;

        try {
            console.log(`🔄 [26-TECH] Kupakua: ${videoUrl}`);
            await ytDlp(videoUrl, options, execOptions);

            const tmpFiles = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith(`ytdlp_${uniqueId}`));
            if (tmpFiles.length > 0) {
                tempFilePath = path.join(os.tmpdir(), tmpFiles[0]);
                const sz = fs.statSync(tempFilePath).size;
                if (sz > 0) {
                    downloaded = true;
                    console.log(`✅ [26-TECH] Imepatikana!`);
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

        const fileExt = path.extname(tempFilePath).replace('.', '') || 'm4a';
        const fileSize = fs.statSync(tempFilePath).size;
        const fileName = `${finalTitle.replace(/[^\w\s-]/g, '').trim() || 'audio'}.${fileExt}`;

        const mimeMap = {
            mp3: 'audio/mpeg',
            m4a: 'audio/mp4',
            webm: 'audio/webm',
            opus: 'audio/ogg',
            ogg: 'audio/ogg',
            wav: 'audio/wav',
            aac: 'audio/aac',
        };
        const mimetype = mimeMap[fileExt] || 'audio/mp4';

        // Jaribu kutuma kama audio kwanza
        try {
            await sock.sendMessage(from, {
                audio: { url: tempFilePath },
                mimetype: mimetype,
                fileName: fileName,
                ptt: false
            }, { quoted: msg });
            console.log('✅ [26-TECH] Imetumwa kama audio');
        } catch (sendErr) {
            console.warn('⚠️ Audio send failed, fallback to document:', sendErr.message);
            // Fallback: tuma kama document
            await sock.sendMessage(from, {
                document: { url: tempFilePath },
                mimetype: mimetype,
                fileName: fileName,
                caption: `🎵 ${finalTitle}`
            }, { quoted: msg });
            console.log('✅ [26-TECH] Imetumwa kama document fallback');
        }

    } catch (error) {
        console.error('YT-DLP Fatal Error:', error);

        let errMsg = '❌ Hitilafu: Imeshindwa kupakua wimbo huu.';
        const allOutput = (error?.stderr || '') + (error?.stdout || '') + (error?.message || '');

        if (allOutput.includes('Sign in') || allOutput.includes('bot')) {
            errMsg = '❌ YouTube imeblock. Fanya refresh cookies.txt';
        } else if (allOutput.includes('format is not available')) {
            errMsg = '❌ Audio haipatikani kwa wimbo huu. Jaribu mwingine.';
        } else if (allOutput.includes('Video unavailable')) {
            errMsg = '❌ Video hii haipatikani au imefungwa.';
        }

        await sock.sendMessage(from, { text: errMsg }, { quoted: msg });

    } finally {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
            } catch (_) {}
        }
    }
}