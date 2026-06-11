/**
 * commands/song.js
 * Download wimbo (Audio MP3) kutoka YouTube — Toleo la ES Modules la 26-TECH
 */

import yts from 'yt-search';
import APIs from '../api.js'; // Imerekebishwa: Inasoma bila mabano ili ilingane na api.js yako

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

        let videoUrl = '';
        let videoTitle = '';

        if (text.startsWith('http://') || text.startsWith('https://')) {
            videoUrl = text;
            const searchLink = await yts(text);
            if (searchLink && searchLink.videos.length > 0) {
                videoTitle = searchLink.videos[0].title;
            }
        } else {
            const { videos } = await yts(text);
            if (!videos || videos.length === 0) {
                return await sock.sendMessage(from, { text: '❌ Wimbo haujapatikana!' }, { quoted: msg });
            }
            videoUrl = videos[0].url;
            videoTitle = videos[0].title;
        }

        const finalTitle = videoTitle || 'Audio';
        let downloadUrl = null;

        // Seva ya 1
        try {
            console.log('🔄 [26-TECH] Kujaribu Yupro Audio...');
            const res1 = await APIs.getYupraDownloadByUrl(videoUrl);
            if (res1 && res1.download) downloadUrl = res1.download;
        } catch (error) {
            console.warn('⚠️ Yupro Audio imefeli.');
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

        await sock.sendMessage(from, {
            audio: { url: downloadUrl },
            mimetype: 'audio/mp4',
            fileName: `${finalTitle.replace(/[^:\w\s-]/g, '')}.mp3`,
            caption: `🎵 *${finalTitle}*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
        }, { quoted: msg });

    } catch (error) {
        console.error('Song fatal error:', error);
        await sock.sendMessage(from, { text: `❌ Hitilafu ya mfumo: ${error.message}` }, { quoted: msg });
    }
}
