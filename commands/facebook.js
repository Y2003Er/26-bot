/**
 * commands/facebook.js
 * Download video kutoka Facebook — Toleo la 26-TECH
 */

import axios from 'axios';

export const name        = 'facebook';
export const description = 'Download video kutoka Facebook';
export const category    = 'media';
export const use         = '<link ya video ya facebook>';
export const alias       = ['fb', 'fbdl'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(from, { 
            text: `❌ Weka link halali ya Facebook video.\nMfano: .fb https://www.facebook.com/watch/?v=xxxx` 
        }, { quoted: msg });
    }

    try {
        await sock.sendMessage(from, { text: '⏳ *Nainyonya video kutoka Facebook, subiri sekunde chache...*' }, { quoted: msg });

        // Tunatumia API ya haraka na ya uhakika ya vreden downloaders
        const response = await axios.get(`https://api.vreden.my.id/api/facebook?url=${encodeURIComponent(text)}`);
        
        if (!response.data || !response.data.result || !response.data.result.videoUrl) {
            throw new Error('FB result not found');
        }

        const videoUrl = response.data.result.videoUrl;
        const title = response.data.result.title || 'Facebook Video';

        await sock.sendMessage(from, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            caption: `*🎬 ${title}*\n\n_⚡ Downloaded by 26-𝚃𝙴𝙲𝙷_`
        }, { quoted: msg });

    } catch (error) {
        console.error('Facebook error:', error);
        await sock.sendMessage(from, { text: '❌ Kushindwa kupakua video hii ya Facebook. Jaribu link nyingine.' }, { quoted: msg });
    }
}
