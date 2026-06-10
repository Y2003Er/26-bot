/**
 * commands/video.js
 * Download video kutoka YouTube — Toleo la 26-TECH (Thabiti)
 */

import yts from 'yt-search';
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
        // Tuma ujumbe wa kuanza kupakua
        await sock.sendMessage(from, { text: '⏳ *Napakua video yako kutoka YouTube, subiri sekunde chache...*' }, { quoted: msg });

        let videoUrl = '';
        let videoTitle = '';
        let videoDuration = '';
        let videoViews = '';

        // 1. Kuchuja kama mtumiaji ameweka link au jina la kutafuta
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

        // 2. Kupakua video kwa kutumia ruhend-scraper (ytdl) kwa usalama wa CommonJS
        const downloadData = await ytdl(videoUrl);

        if (!downloadData || !downloadData.video) {
            return await sock.sendMessage(from, { 
                text: '❌ Imeshindwa kupakua video hii kwa sasa kutokana na hitilafu ya YouTube server. Jaribu tena baadae.' 
            }, { quoted: msg });
        }

        const finalTitle = videoTitle || downloadData.title || 'Video';
        const videoBufferUrl = downloadData.video;

        // 3. Tuma video kwenda kwa mtumiaji ikiwa na brand ya 26-𝐓𝐄𝐂𝐇
        await sock.sendMessage(from, {
            video: { url: videoBufferUrl },
            mimetype: 'video/mp4',
            fileName: `${finalTitle.replace(/[^:\w\s-]/g, '')}.mp4`,
            caption: `🎬 *${finalTitle}*\n\n⏱️ *Muda:* ${videoDuration || 'Haufahamiki'}\n👀 *Views:* ${videoViews || '0'}\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
        }, { quoted: msg });

    } catch (error) {
        console.error('Video downloader error:', error);
        await sock.sendMessage(from, { text: '❌ Kushindwa kupakua video, mfumo una fujo kwa sasa au faili ni kubwa mno.' }, { quoted: msg });
    }
}
