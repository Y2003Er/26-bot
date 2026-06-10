/**
 * commands/video.js
 * Download video kutoka YouTube — Toleo la 26-TECH
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
        } else {
            const { videos } = await yts(text);
            if (!videos || videos.length === 0) {
                return await sock.sendMessage(from, { text: '❌ Video haijapatikana!' }, { quoted: msg });
            }
            videoUrl = videos[0].url;
            videoTitle = videos[0].title;
        }

        // Kuchota video kwa kutumia API yetu
        const apiUrl = `https://api.eliteprotech.my.id/api/download/ytmp4?url=${encodeURIComponent(videoUrl)}`;
        const response = await axios.get(apiUrl);
        
        if (!response.data || !response.data.result || !response.data.result.download) {
            throw new Error('Download link missing');
        }

        const downloadUrl = response.data.result.download;
        const finalTitle = response.data.result.title || videoTitle || 'Video';

        await sock.sendMessage(from, {
            video: { url: downloadUrl },
            mimetype: 'video/mp4',
            fileName: `${finalTitle.replace(/[^:\w\s-]/g, '')}.mp4`,
            caption: `*🎬 ${finalTitle}*\n\n_⚡ Powered by 26-𝚃𝙴𝙲𝙷_`
        }, { quoted: msg });

    } catch (error) {
        console.error('Video downloader error:', error);
        await sock.sendMessage(from, { text: '❌ Kushindwa kupakua video, mfumo una fujo kwa sasa.' }, { quoted: msg });
    }
}
