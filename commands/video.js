/**
 * commands/video.js
 * Download video kutoka YouTube — Toleo la ES Modules la 26-TECH
 */

import yts from 'yt-search';
import APIs from '../api.js'; 

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

        const finalTitle = videoTitle || 'Video';
        let downloadUrl = null;

        // Seva ya 1
        try {
            console.log('🔄 [26-TECH] Kujaribu Yupro Video...');
            const res1 = await APIs.getYupraVideoByUrl(videoUrl);
            if (res1 && res1.download) downloadUrl = res1.download;
        } catch (error) {
            console.warn('⚠️ Yupro Video imefeli.');
        }

        // Seva ya 2
        if (!downloadUrl) {
            try {
                console.log('🔄 [26-TECH] Kujaribu Okatsu Video...');
                const res2 = await APIs.getOkatsuVideoByUrl(videoUrl);
                if (res2 && res2.download) downloadUrl = res2.download;
            } catch (error) {
                console.warn('⚠️ Okatsu Video imefeli.');
            }
        }

        // Seva ya 3
        if (!downloadUrl) {
            try {
                console.log('🔄 [26-TECH] Kujaribu EliteProTech Video...');
                const res3 = await APIs.getEliteProTechVideoByUrl(videoUrl);
                if (res3 && res3.download) downloadUrl = res3.download;
            } catch (error) {
                console.error('❌ Seva zote za Video zimegoma.');
            }
        }

        if (!downloadUrl) {
            return await sock.sendMessage(from, { 
                text: '❌ Imeshindwa kupakua video hii kwa sasa. Seva zote ziko bize au zimezuiwa na YouTube.' 
            }, { quoted: msg });
        }

        await sock.sendMessage(from, {
            video: { url: downloadUrl },
            mimetype: 'video/mp4',
            fileName: `${finalTitle.replace(/[^:\w\s-]/g, '')}.mp4`,
            caption: `🎬 *${finalTitle}*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
        }, { quoted: msg });

    } catch (err) {
        console.error('Video fatal error:', err);
        await sock.sendMessage(from, { text: `❌ Hitilafu ya mfumo: ${err.message}` }, { quoted: msg });
    }
}
