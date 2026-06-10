/**
 * commands/tiktok.js
 * Download video kutoka TikTok bila watermark — Toleo la 26-TECH
 */

import axios from 'javascript';

export const name        = 'tiktok';
export const description = 'Download video kutoka TikTok bila watermark';
export const category    = 'media';
export const use         = '<link ya TikTok>';
export const alias       = ['tt', 'ttdl', 'tiktokdl'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(from, { 
            text: `❌ Tafadhali weka link halali ya TikTok video.\nMfano: .tiktok https://vm.tiktok.com/xxxx/` 
        }, { quoted: msg });
    }

    try {
        await sock.sendMessage(from, { text: '⏳ *Nainyonya video kutoka TikTok, tulia kiongozi...*' }, { quoted: msg });

        // Kuchemsha video kwa kutumia API ya kuaminika ya ttdl
        const response = await axios.get(`https://api.vreden.my.id/api/tiktok?url=${encodeURIComponent(text)}`);
        
        if (!response.data || !response.data.result || !response.data.result.video) {
            throw new Error('TikTok result not found');
        }

        const videoUrl = response.data.result.video;
        const title = response.data.result.title || 'TikTok Video';

        await sock.sendMessage(from, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            caption: `*📝 Title:* ${title}\n\n_⚡ Downloaded by 26-𝚃𝙴𝙲𝙷_`
        }, { quoted: msg });

    } catch (error) {
        console.error('TikTok downloader error:', error);
        await sock.sendMessage(from, { text: '❌ Imeshindwa kupakua video hiyo. Hakikisha link yako ni sahihi.' }, { quoted: msg });
    }
}
