/**
 * commands/song.js
 * Download wimbo (Audio MP3) kutoka YouTube — Toleo la ES Modules la 26-TECH
 */

import yts from 'yt-search';
import APIs from '../api.js';

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
            text: `❌ Tafadhali andika jina la wimbo au uweke link.\nMfano: .song Mbosso Amepotea` 
        }, { quoted: msg });
    }

    try {
        await sock.sendMessage(from, { text: '⏳ *Natafuta na kuandaa wimbo wako, subiri kidogo...*' }, { quoted: msg });

        let videoUrl    = '';
        let videoTitle  = '';
        let videoAuthor = '';
        let videoDuration = '';
        let videoThumb  = '';

        // Helper: chagua thumbnail bora kutoka object au string
        const getThumb = (v) => {
            if (!v) return '';
            // yts inaleta thumbnail kama string au object {hqDefault, mqDefault, ...}
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

        if (text.startsWith('http://') || text.startsWith('https://')) {
            videoUrl = text;
            const searchLink = await yts(text);
            if (searchLink && searchLink.videos.length > 0) {
                const v = searchLink.videos[0];
                videoTitle    = v.title;
                videoAuthor   = v.author?.name || v.author || '';
                videoDuration = v.timestamp || '';
                videoThumb    = getThumb(v);
            }
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
        let downloadUrl = null;

        // Seva ya 1
        try {
            console.log('🔄 [26-TECH] Kujaribu Yupra Audio...');
            const res1 = await APIs.getYupraDownloadByUrl(videoUrl);
            if (res1 && res1.download) downloadUrl = res1.download;
        } catch (error) {
            console.warn('⚠️ Yupra Audio imefeli.');
        }

        // Seva ya 2
        if (!downloadUrl) {
            try {
                console.log('🔄 [26-TECH] Kujaribu Izumi Audio...');
                const res2 = await APIs.getIzumiDownloadByUrl(videoUrl);
                if (res2 && res2.download) downloadUrl = res2.download;
            } catch (error) {
                console.warn('⚠️ Izumi Audio imefeli.');
            }
        }

        // Seva ya 3
        if (!downloadUrl) {
            try {
                console.log('🔄 [26-TECH] Kujaribu Okatsu Audio...');
                const res3 = await APIs.getOkatsuDownloadByUrl(videoUrl);
                if (res3 && res3.download) downloadUrl = res3.download;
            } catch (error) {
                console.warn('⚠️ Okatsu Audio imefeli.');
            }
        }

        // Seva ya 4
        if (!downloadUrl) {
            try {
                console.log('🔄 [26-TECH] Kujaribu EliteProTech Audio...');
                const res4 = await APIs.getEliteProTechDownloadByUrl(videoUrl);
                if (res4 && res4.download) downloadUrl = res4.download;
            } catch (error) {
                console.error('❌ Seva zote za Audio zimegoma.');
            }
        }

        if (!downloadUrl) {
            return await sock.sendMessage(from, { 
                text: '❌ Imeshindwa kupakua wimbo huu kwa sasa. Seva zote za audio zimejaa au ziko chini.' 
            }, { quoted: msg });
        }

        // ✅ Tuma picha ya thumbnail na maelezo kwanza
        if (videoThumb && typeof videoThumb === 'string' && videoThumb.startsWith('http')) {
            await sock.sendMessage(from, {
                image: { url: videoThumb },
                caption: `🎵 *${finalTitle}*\n👤 *Msanii:* ${finalAuthor}\n⏱️ *Muda:* ${finalDuration}\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
            }, { quoted: msg });
        }

        // ✅ Tuma audio kwa mimetype sahihi
        await sock.sendMessage(from, {
            audio: { url: downloadUrl },
            mimetype: 'audio/mpeg',
            ptt: false,
            fileName: `${finalTitle.replace(/[^\w\s-]/g, '')}.mp3`,
        }, { quoted: msg });

    } catch (error) {
        console.error('Song fatal error:', error);
        await sock.sendMessage(from, { text: `❌ Hitilafu ya mfumo: ${error.message}` }, { quoted: msg });
    }
}
