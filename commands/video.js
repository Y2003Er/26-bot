/**
 * commands/video.js
 * Download video kutoka YouTube — Toleo la 26-TECH (Bypass Mode)
 */

import yts from 'yt-search';
import axios from 'axios';

export const name        = 'video';
export const description = 'Download video kutoka YouTube';
export const category    = 'media';
export const use         = '<jina la video au link>';
export const alias       = ['ytv', 'ytmp4', 'ytvid'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(from, { 
            text: `❌ Tafadhali andika jina la video au uweke link ya YouTube.\nMfano: .video Alikiba New Song` 
        }, { quoted: msg });
    }

    try {
        // Tuma ujumbe wa kuanza kupakua
        await sock.sendMessage(from, { text: '⏳ *Napakua video yako kutoka YouTube, subiri sekunde chache...*' }, { quoted: msg });

        let videoUrl = '';
        let videoTitle = '';
        let videoDuration = '';
        let videoViews = '';

        // 1. Tafuta video kwenye YouTube kwa yt-search
        if (text.startsWith('http://') || text.startsWith('https://')) {
            videoUrl = text;
            const searchLink = await yts(text);
            if (searchLink && searchLink.videos.length > 0) {
                videoTitle = searchLink.videos[0].title;
                videoDuration = searchLink.videos[0].timestamp;
                videoViews = searchLink.videos[0].views;
            }
        } else {
            const { videos } = await yts(text);
            if (!videos || videos.length === 0) {
                return await sock.sendMessage(from, { text: '❌ Video haijapatikana!' }, { quoted: msg });
            }
            videoUrl = videos[0].url;
            videoTitle = videos[0].title;
            videoDuration = videos[0].timestamp;
            videoViews = videos[0].views;
        }

        const finalTitle = videoTitle || 'Video';
        let downloadUrl = null;

        // TUNAPIGA API YA DIRECT BYPASS AMBACHO HAIKWAMI RAILWAY
        try {
            const apiRes = await axios.get(`https://api.giftedtech.my.id/api/download/dlmp4?url=${encodeURIComponent(videoUrl)}`);
            if (apiRes.data && apiRes.data.success && apiRes.data.result && apiRes.data.result.download_url) {
                downloadUrl = apiRes.data.result.download_url;
            } else if (apiRes.data && apiRes.data.result && apiRes.data.result.download) {
                downloadUrl = apiRes.data.result.download;
            }
        } catch (e) {
            console.warn('⚠️ Bypass API 1 imefeli, tunajaribu API 2...');
            try {
                const apiRes2 = await axios.get(`https://api.agatz.xyz/api/ytmp4?url=${encodeURIComponent(videoUrl)}`);
                if (apiRes2.data && apiRes2.data.status === 200 && apiRes2.data.data.url) {
                    downloadUrl = apiRes2.data.data.url;
                }
            } catch (e2) {
                console.error('❌ API zote zimegoma kupenya.');
            }
        }

        // Kama bado zote zimegoma kupata link ya download
        if (!downloadUrl) {
            return await sock.sendMessage(from, { 
                text: '❌ Kushindwa kupakua video. Mfumo wa YouTube umeweka ulinzi mkali sana kwenye seva za Railway kwa sasa. Jaribu tena baadae kidogo.' 
            }, { quoted: msg });
        }

        // 3. Tuma video ikiwa imekamilika kwenda kwa mteja ikiwa na brand ya 26-𝐓𝐄𝐂𝐇
        await sock.sendMessage(from, {
            video: { url: downloadUrl },
            mimetype: 'video/mp4',
            fileName: `${finalTitle.replace(/[^:\w\s-]/g, '')}.mp4`,
            caption: `🎬 *${finalTitle}*\n\n⏱️ *Muda:* ${videoDuration || 'Haufahamiki'}\n👀 *Views:* ${videoViews || '0'}\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
        }, { quoted: msg });

    } catch (error) {
        console.error('Video command fatal error:', error);
        await sock.sendMessage(from, { text: '❌ Kushindwa kupakua video, mfumo una fujo kwa sasa.' }, { quoted: msg });
    }
}
