import yts from 'yt-search';
import ytDlp from 'yt-dlp-exec';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const name        = 'song';
export const description = 'Download wimbo (MP3) kutoka YouTube';
export const category    = 'media';
export const use         = '<jina la wimbo au link>';
export const alias       = ['play', 'music', 'mp3'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(from, {
            text: '❌ Tafadhali andika jina la wimbo.\nMfano: .song Mbosso Pawa'
        }, { quoted: msg });
    }

    let tempFilePath = '';

    try {
        await sock.sendMessage(from, { 
            text: '⏳ *Natafuta na kuandaa wimbo wako, subiri kidogo...*' 
        }, { quoted: msg });

        // Tafuta video
        let videoUrl, videoTitle, videoAuthor, videoDuration, videoThumb;

        if (text.startsWith('http://') || text.startsWith('https://')) {
            videoUrl = text;
            const sl = await yts(text);
            const v  = sl?.videos?.[0];
            videoTitle    = v?.title    || 'Audio';
            videoAuthor   = v?.author?.name || '';
            videoDuration = v?.timestamp || '--:--';
            videoThumb    = v?.thumbnail || '';
        } else {
            const { videos } = await yts(text);
            if (!videos?.length) {
                return await sock.sendMessage(from, { 
                    text: '❌ Wimbo haujapatikana!' 
                }, { quoted: msg });
            }
            const v       = videos[0];
            videoUrl      = v.url;
            videoTitle    = v.title;
            videoAuthor   = v.author?.name || '';
            videoDuration = v.timestamp || '--:--';
            videoThumb    = v.thumbnail || '';
        }

        // Kikomo cha muda
        const mins = parseInt(videoDuration.split(':')[0]);
        if (mins > 12) {
            return await sock.sendMessage(from, { 
                text: '❌ Wimbo unazidi dakika 12.' 
            }, { quoted: msg });
        }

        // Tuma thumbnail
        if (videoThumb?.startsWith('http')) {
            try {
                await sock.sendMessage(from, {
                    image: { url: videoThumb },
                    caption: `🎵 *${videoTitle}*\n👤 *Msanii:* ${videoAuthor}\n⏱️ *Muda:* ${videoDuration}\n\n📥 *Napakua kutoka YouTube...*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
                }, { quoted: msg });
            } catch (_) {}
        }

        // Pakua kwa yt-dlp
        const safeFileName = videoTitle.replace(/[^\w\s-]/g, '').trim() || 'audio';
        tempFilePath = path.join(os.tmpdir(), `${Date.now()}_${safeFileName}.mp3`);

        await ytDlp(videoUrl, {
            extractAudio: true,
            audioFormat: 'mp3',
            audioQuality: 0,
            output: tempFilePath,
            cookiesFromBrowser: undefined,
            cookies: path.resolve('./cookies.json'),
            noCheckCertificates: true,
            noWarnings: true,
        });

        // Tuma wimbo
        await sock.sendMessage(from, {
            audio: fs.readFileSync(tempFilePath),
            mimetype: 'audio/mpeg',
            fileName: `${safeFileName}.mp3`,
            ptt: false
        }, { quoted: msg });

    } catch (error) {
        console.error('Song error:', error.message);
        await sock.sendMessage(from, { 
            text: `❌ Imeshindwa kupakua: ${error.message}` 
        }, { quoted: msg });
    } finally {
        // Futa faili la muda
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch (_) {}
        }
    }
}