/**
 * commands/song.js
 * Download wimbo (Audio MP3) kutoka YouTube — Toleo la Kasi na Uhakika la 26-TECH
 */

import yts from 'yt-search';

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
            text: `❌ Tafadhali andika jina la wimbo au uweke link.\nMfano: .song Mbosso Pawa`
        }, { quoted: msg });
    }

    const { default: APIs } = await import('../api.js');

    try {
        await sock.sendMessage(from, { text: '⏳ *Natafuta wimbo wako, subiri kidogo...*' }, { quoted: msg });

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
        let downloadUrl = null;

        // Mfumo wa Fast Fallback — Unatafuta link kwa haraka
        // Seva ya 1 — Yupra
        try {
            const res1 = await Promise.race([
                APIs.getYupraDownloadByUrl(videoUrl),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000))
            ]);
            if (res1?.download) { downloadUrl = res1.download; console.log('✅ Yupra'); }
        } catch { console.warn('⚠️ Yupra imefeli'); }

        // Seva ya 2 — Izumi
        if (!downloadUrl) {
            try {
                const res2 = await Promise.race([
                    APIs.getIzumiDownloadByUrl(videoUrl),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000))
                ]);
                if (res2?.download) { downloadUrl = res2.download; console.log('✅ Izumi'); }
            } catch { console.warn('⚠️ Izumi imefeli'); }
        }

        // Seva ya 3 — Okatsu
        if (!downloadUrl) {
            try {
                const res3 = await Promise.race([
                    APIs.getOkatsuDownloadByUrl(videoUrl),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000))
                ]);
                if (res3?.download) { downloadUrl = res3.download; console.log('✅ Okatsu'); }
            } catch { console.warn('⚠️ Okatsu imefeli'); }
        }

        // Seva ya 4 — EliteProTech
        if (!downloadUrl) {
            try {
                const res4 = await Promise.race([
                    APIs.getEliteProTechDownloadByUrl(videoUrl),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
                ]);
                if (res4?.download) { downloadUrl = res4.download; console.log('✅ EliteProTech'); }
            } catch { console.error('❌ Seva zote zimegoma'); }
        }

        if (!downloadUrl) {
            return await sock.sendMessage(from, {
                text: '❌ Imeshindwa kupakua wimbo huu. Seva zote za audio ziko chini kwa sasa.'
            }, { quoted: msg });
        }

        // 1. Tuma kwanza taarifa za Wimbo na Thumbnail
        if (videoThumb && videoThumb.startsWith('http')) {
            try {
                await sock.sendMessage(from, {
                    image: { url: videoThumb },
                    caption: `🎵 *${finalTitle}*\n👤 *Msanii:* ${finalAuthor}\n⏱️ *Muda:* ${finalDuration}\n\n📥 *Naleta faili la audio sasa hivi...*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
                }, { quoted: msg });
            } catch (_) {}
        }

        // 2. Tuma kama Audio Message inayoplay moja kwa moja (Streaming Method)
        const safeFileName = finalTitle.replace(/[^\w\s-]/g, '').trim() || 'audio';

        try {
            console.log(`🔄 [26-TECH] Kujaribu kutuma kama audio stream: ${downloadUrl}`);
            await sock.sendMessage(from, {
                audio: { url: downloadUrl },
                mimetype: 'audio/mpeg', // FIXED: Imerekebishwa kuwa audio/mpeg ili WhatsApp icheze MP3 moja kwa moja
                fileName: `${safeFileName}.mp3`,
                ptt: true
            }, { quoted: msg });

            console.log('✅ Audio imetumwa na inacheza!');
        } catch (audioErr) {
            console.warn('⚠️ Audio stream imefeli, tunageukia njia ya Document:', audioErr.message);

            // Fallback: Kama boti inagoma kutuma kama audio, inatupia kama Document (Hapa haifeli kamwe)
            await sock.sendMessage(from, {
                document: { url: downloadUrl },
                mimetype: 'audio/mpeg',
                fileName: `${safeFileName}.mp3`,
                caption: `🎵 *${finalTitle}* — ${finalAuthor}`,
            }, { quoted: msg });
        }

    } catch (error) {
        console.error('Song fatal error:', error);
        await sock.sendMessage(from, { text: `❌ Hitilafu ya mfumo: ${error.message}` }, { quoted: msg });
    }
}
