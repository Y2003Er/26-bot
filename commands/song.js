/**
 * commands/song.js
 * Download wimbo (Audio MP3) kutoka YouTube — Toleo la ES Modules la 26-TECH
 * FIXED: Buffer download + mimetype sahihi + thumbnail error handling
 */

import yts from 'yt-search';
import axios from 'axios';
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
        await sock.sendMessage(from, { text: '⏳ *Natafuta wimbo wako, subiri kidogo...*' }, { quoted: msg });

        let videoUrl      = '';
        let videoTitle    = '';
        let videoAuthor   = '';
        let videoDuration = '';
        let videoThumb    = '';

        if (text.startsWith('http://') || text.startsWith('https://')) {
            videoUrl = text;
            try {
                const searchLink = await yts(text);
                if (searchLink?.videos?.length > 0) {
                    const v       = searchLink.videos[0];
                    videoTitle    = v.title;
                    videoAuthor   = v.author?.name || v.author || '';
                    videoDuration = v.timestamp || '';
                    videoThumb    = v.thumbnail || v.image || '';
                }
            } catch { /* search ya metadata si lazima */ }
        } else {
            const { videos } = await yts(text);
            if (!videos || videos.length === 0) {
                return await sock.sendMessage(from, { text: '❌ Wimbo haujapatikana!' }, { quoted: msg });
            }
            const v       = videos[0];
            videoUrl      = v.url;
            videoTitle    = v.title;
            videoAuthor   = v.author?.name || v.author || '';
            videoDuration = v.timestamp || '';
            videoThumb    = v.thumbnail || v.image || '';
        }

        const finalTitle    = videoTitle  || 'Audio';
        const finalAuthor   = videoAuthor || 'Haijulikani';
        const finalDuration = videoDuration || '--:--';
        let downloadUrl = null;

        // Seva ya 1 — Yupra
        try {
            console.log('🔄 [26-TECH] Kujaribu Yupra Audio...');
            const res1 = await APIs.getYupraDownloadByUrl(videoUrl);
            if (res1?.download) downloadUrl = res1.download;
        } catch {
            console.warn('⚠️ Yupra Audio imefeli.');
        }

        // Seva ya 2 — Izumi
        if (!downloadUrl) {
            try {
                console.log('🔄 [26-TECH] Kujaribu Izumi Audio...');
                const res2 = await APIs.getIzumiDownloadByUrl(videoUrl);
                if (res2?.download) downloadUrl = res2.download;
            } catch {
                console.warn('⚠️ Izumi Audio imefeli.');
            }
        }

        // Seva ya 3 — Okatsu
        if (!downloadUrl) {
            try {
                console.log('🔄 [26-TECH] Kujaribu Okatsu Audio...');
                const res3 = await APIs.getOkatsuDownloadByUrl(videoUrl);
                if (res3?.download) downloadUrl = res3.download;
            } catch {
                console.warn('⚠️ Okatsu Audio imefeli.');
            }
        }

        // Seva ya 4 — EliteProTech
        if (!downloadUrl) {
            try {
                console.log('🔄 [26-TECH] Kujaribu EliteProTech Audio...');
                const res4 = await APIs.getEliteProTechDownloadByUrl(videoUrl);
                if (res4?.download) downloadUrl = res4.download;
            } catch {
                console.error('❌ Seva zote za Audio zimegoma.');
            }
        }

        if (!downloadUrl) {
            return await sock.sendMessage(from, { 
                text: '❌ Imeshindwa kupakua wimbo huu kwa sasa. Seva zote za audio zimejaa au ziko chini.' 
            }, { quoted: msg });
        }

        // ✅ FIX #1 — Download buffer kwanza kabla ya kutuma
        // WhatsApp/Baileys haifanyi kazi vizuri na audio URL moja kwa moja
        await sock.sendMessage(from, { text: '📥 *Inapakua audio, subiri kidogo...*' }, { quoted: msg });

        let audioBuffer;
        try {
            const audioRes = await axios.get(downloadUrl, {
                responseType: 'arraybuffer',
                timeout: 120000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            audioBuffer = Buffer.from(audioRes.data);
        } catch (dlErr) {
            console.error('❌ Buffer download imefeli:', dlErr.message);
            return await sock.sendMessage(from, {
                text: '❌ Imeshindwa kupakua audio. Jaribu tena baadaye.'
            }, { quoted: msg });
        }

        // ✅ Tuma thumbnail na maelezo kwanza
        if (videoThumb) {
            try {
                await sock.sendMessage(from, {
                    image: { url: videoThumb },
                    caption: `🎵 *${finalTitle}*\n👤 *Msanii:* ${finalAuthor}\n⏱️ *Muda:* ${finalDuration}\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
                }, { quoted: msg });
            } catch { /* thumbnail si muhimu sana */ }
        }

        // ✅ FIX #2 — Tuma Buffer na mimetype sahihi (audio/mp4 si audio/mpeg)
        // FIX #3 — Imeondoa fileName field ambayo haisaidii kwa audio messages
        await sock.sendMessage(from, {
            audio:    audioBuffer,
            mimetype: 'audio/mp4',
            ptt:      false,
        }, { quoted: msg });

    } catch (error) {
        console.error('Song fatal error:', error);
        await sock.sendMessage(from, { text: `❌ Hitilafu ya mfumo: ${error.message}` }, { quoted: msg });
    }
}
