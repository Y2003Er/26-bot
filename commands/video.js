/**
 * commands/video.js
 * Download video kutoka YouTube — Toleo la Debug la 26-TECH
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
        await sock.sendMessage(from, { text: '⏳ *Napakua video yako kutoka YouTube, subiri sekunde chache...*' }, { quoted: msg });

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
                return await sock.sendMessage(from, { text: '❌ Video haijapatikana!' }, { quoted: msg });
            }
            videoUrl = videos[0].url;
            videoTitle = videos[0].title;
        }

        let downloadUrl = null;
        let errorLogs = [];

        // Jaribio la 1: GiftedTech
        try {
            const res1 = await axios.get(`https://api.giftedtech.my.id/api/download/dlmp4?url=${encodeURIComponent(videoUrl)}`);
            if (res1.data?.success && (res1.data?.result?.download_url || res1.data?.result?.download)) {
                downloadUrl = res1.data.result.download_url || res1.data.result.download;
            } else {
                errorLogs.push(`GiftedTech: Response invalid (${JSON.stringify(res1.data)})`);
            }
        } catch (e) {
            errorLogs.push(`GiftedTech Error: ${e.message}`);
        }

        // Jaribio la 2: Agatz
        if (!downloadUrl) {
            try {
                const res2 = await axios.get(`https://api.agatz.xyz/api/ytmp4?url=${encodeURIComponent(videoUrl)}`);
                if (res2.data?.status === 200 && res2.data?.data?.url) {
                    downloadUrl = res2.data.data.url;
                } else {
                    errorLogs.push(`Agatz: Response invalid (${JSON.stringify(res2.data)})`);
                }
            } catch (e2) {
                errorLogs.push(`Agatz Error: ${e2.message}`);
            }
        }

        // Kama zote zimegoma, tunarusha makosa halisi kule WhatsApp ili tujue nini kimefeli
        if (!downloadUrl) {
            let debugMessage = `❌ *Kushindwa kupakua video.*\n\n*Ripoti ya Makosa (Debug Logs):*\n`;
            errorLogs.forEach((log, index) => {
                debugMessage += `${index + 1}. ${log}\n`;
            });
            debugMessage += `\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`;
            
            return await sock.sendMessage(from, { text: debugMessage }, { quoted: msg });
        }

        // 3. Tuma video ikiwa imepatikana
        await sock.sendMessage(from, {
            video: { url: downloadUrl },
            mimetype: 'video/mp4',
            fileName: `${videoTitle.replace(/[^:\w\s-]/g, '')}.mp4`,
            caption: `🎬 *${videoTitle || 'Video'}*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
        }, { quoted: msg });

    } catch (error) {
        console.error('Video command fatal error:', error);
        await sock.sendMessage(from, { text: `❌ Fatal Error: ${error.message}` }, { quoted: msg });
    }
}
