/**
 * commands/video.js
 * Download video kutoka YouTube — Toleo la 26-TECH (Multi-API Auto Fallback)
 */

import yts from 'yt-search';
import axios from 'axios';
import pkg from 'ruhend-scraper';
const { ytdl } = pkg;

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
        await sock.sendMessage(from, { text: '⏳ *Napakua video yako kutoka YouTube, subiri sekunde chache...*' }, { quoted: msg });

        let videoUrl = '';
        let videoTitle = '';
        let videoDuration = '';
        let videoViews = '';

        // 1. Tafuta video kwenye YouTube
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

        // NJIA YA 1: Kujaribu kutumia API ya bure na imara ya Y2Mate REST API
        try {
            console.log('🔄 Jaribio la 1: Inapakua kupitia Y2Mate API...');
            const apiRes = await axios.get(`https://api.vreden.web.id/api/ytmp4?url=${encodeURIComponent(videoUrl)}`);
            if (apiRes.data && apiRes.data.result && apiRes.data.result.download) {
                downloadUrl = apiRes.data.result.download;
            }
        } catch (apiErr) {
            console.warn('⚠️ Jaribio la 1 limefeli, tunahamia Jaribio la 2...');
        }

        // NJIA YA 2: Kama Njia ya 1 imefeli, tunajaribu kutumia Ruhend Scraper
        if (!downloadUrl) {
            try {
                console.log('🔄 Jaribio la 2: Inapakua kupitia Ruhend Scraper...');
                const downloadData = await ytdl(videoUrl);
                if (downloadData && downloadData.video) {
                    downloadUrl = downloadData.video;
                }
            } catch (scrpErr) {
                console.warn('⚠️ Jaribio la 2 limefeli, tunahamia Jaribio la 3...');
            }
        }

        // NJIA YA 3: Kama zote zimefeli, tunatumia API mbadala ya tatu (Aggregator)
        if (!downloadUrl) {
            try {
                console.log('🔄 Jaribio la 3: Inapakua kupitia API ya Akiba...');
                const fallbackRes = await axios.get(`https://api.sandipbhetwal.com/api/ytmp4?url=${encodeURIComponent(videoUrl)}`);
                if (fallbackRes.data && fallbackRes.data.url) {
                    downloadUrl = fallbackRes.data.url;
                }
            } catch (fbErr) {
                console.error('❌ Njia zote 3 za download zimegonga ukuta.');
            }
        }

        // Kama mifumo yote imegoma kabisa kutoa link ya download
        if (!downloadUrl) {
            return await sock.sendMessage(from, { 
                text: '❌ Kushindwa kupakua video. YouTube wameweka ulinzi mkali kwa sasa au faili ni kubwa mno kupita kiasi. Jaribu link ya video nyingine.' 
            }, { quoted: msg });
        }

        // 3. Tuma video kwenda kwa mtumiaji ikiwa na brand ya 26-𝐓𝐄𝐂𝐇
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
