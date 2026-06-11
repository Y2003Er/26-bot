/**
 * commands/song.js
 * Download wimbo (Audio MP3) kutoka YouTube — Toleo la Kasi ya Mwanga la YT-DLP [26-TECH]
 */

import yts from 'yt-search';
import ytDlp from 'yt-dlp-exec';
import fs from 'fs';
import path from 'path';
import os from 'os';

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

        // Helper: chagua thumbnail bora kutoka object au string
        const getThumb = (v) => {
            if (!v) return '';
            if (typeof v.thumbnail === 'string' && v.thumbnail.startsWith('http')) return v.thumbnail;
            if (typeof v.thumbnail === 'object' && v.thumbnail !== null) {
                return v.thumbnail.hqDefault || v.thumbnail.mqDefault || v.thumbnail.sdDefault || '';
            }
            if (typeof v.image === 'string' && v.image.startsWith('http')) return v.image;
            // Fallback: jenga URL ya YouTube thumbnail kwa video ID
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
            // Fallback thumbnail kwa URL moja kwa moja
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

        // Kikomo cha urefu kulinda RAM
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

        // Kutengeneza jina la faili la muda
        const uniqueId       = Date.now();
        const outputTemplate = path.join(os.tmpdir(), `ytdlp_${uniqueId}`);

        // Maelekezo ya YT-DLP — cookies HAZITUMIWI (zilikuwa JSON, yt-dlp inataka Netscape)
        const ytDlpArgs = {
            extractAudio:       true,
            audioFormat:        'mp3',
            audioQuality:       '0',
            output:             outputTemplate,
            noCheckCertificates: true,
            noWarnings:         true,
            preferFreeFormats:  true,
        };

        // Tumia cookies.txt KAMA ipo na ni Netscape format (.txt si .json)
        const cookiesTxt = path.resolve('./cookies.txt');
        if (fs.existsSync(cookiesTxt)) {
            ytDlpArgs.cookies = cookiesTxt;
            console.log('✅ [26-TECH] YT-DLP: cookies.txt imepachikwa.');
        } else {
            console.log('ℹ️ [26-TECH] YT-DLP: Hakuna cookies — inaendelea bila cookies.');
        }

        console.log(`🔄 [26-TECH] YT-DLP inapakua: ${videoUrl}`);
        await ytDlp(videoUrl, ytDlpArgs);

        // Tafuta faili halisi lililoundwa (yt-dlp inaweza kuongeza extension mara mbili)
        const tmpFiles = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith(`ytdlp_${uniqueId}`));
        if (tmpFiles.length === 0) throw new Error('Faili la MP3 halijaundwa na yt-dlp');
        tempFilePath = path.join(os.tmpdir(), tmpFiles[0]);

        console.log(`✅ [26-TECH] Faili lipo: ${tempFilePath} — linatumwa WhatsApp...`);

        // Tuma audio WhatsApp
        await sock.sendMessage(from, {
            audio:    { url: tempFilePath },
            mimetype: 'audio/mpeg',
            fileName: `${finalTitle.replace(/[^\w\s-]/g, '').trim() || 'audio'}.mp3`,
            ptt:      false
        }, { quoted: msg });

        console.log('✅ [26-TECH] Kazi imekamilika!');

    } catch (error) {
        console.error('YT-DLP Fatal Error:', error);
        await sock.sendMessage(from, {
            text: `❌ Hitilafu ya YT-DLP: Imeshindwa kukamilisha maombi.`
        }, { quoted: msg });

    } finally {
        // Futa faili la muda daima — hata kama kuna hitilafu
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
                console.log('🗑️ [26-TECH] Faili la muda limefutwa.');
            } catch (_) {}
        }
    }
}
