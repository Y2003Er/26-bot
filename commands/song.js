/**
 * commands/song.js
 * Download wimbo (Audio MP3) kutoka YouTube — Toleo la Uhakika la Ruhend [26-TECH]
 */

import yts from 'yt-search';
import { ytdl } from 'ruhend-scraper'; 

export const name        = 'song';
export const description = 'Download wimbo (MP3) kutoka YouTube kupitia Ruhend Scraper';
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

        // Kikomo cha urefu kulinda RAM ya Railway
        if (finalDuration.split(':').length > 2) {
            return await sock.sendMessage(from, { 
                text: '❌ Wimbo mrefu sana. Tafadhali weka wimbo chini ya dakika 12.' 
            }, { quoted: msg });
        }
        
        const mins = parseInt(finalDuration.split(':')[0]);
        if (mins > 12) {
            return await sock.sendMessage(from, { 
                text: '❌ Wimbo unazidi dakika 12. Tafadhali omba wimbo mfupi.' 
            }, { quoted: msg });
        }

        // Tuma Thumbnail
        if (videoThumb && videoThumb.startsWith('http')) {
            try {
                await sock.sendMessage(from, {
                    image: { url: videoThumb },
                    caption: `🎵 *${finalTitle}*\n👤 *Msanii:* ${finalAuthor}\n⏱️ *Muda:* ${finalDuration}\n\n📥 *Napakua kutoka YouTube (26-TECH Direct Pass)...*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
                }, { quoted: msg });
            } catch (_) {}
        }

        const safeFileName = finalTitle.replace(/[^\w\s-]/g, '').trim() || 'audio';

        console.log(`🔄 [26-TECH] Kujaribu kupakua kupitia Ruhend API: ${videoUrl}`);
        
        // Ruhend inafanya kila kitu yenyewe kwenye seva zao kisha inatupa link ya audio iliyokamilika
        const res = await ytdl(videoUrl);
        
        if (!res || !res.audio) {
            throw new Error("Ruhend imeshindwa kutoa kiungo cha audio.");
        }

        // Tuma kama Audio Message moja kwa moja kutumia URL ya Ruhend
        await sock.sendMessage(from, {
            audio: { url: res.audio }, 
            mimetype: 'audio/mpeg',
            fileName: `${safeFileName}.mp3`,
            ptt: false
        }, { quoted: msg });

        console.log('✅ Ruhend: Audio imetumwa kwa mafanikio!');

    } catch (error) {
        console.error('Ruhend error au Fatal error:', error.message);
        await sock.sendMessage(from, { 
            text: `❌ Seva zimezidiwa kidogo. Imeshindwa kupakua kwa sasa.` 
        }, { quoted: msg });
    }
}
