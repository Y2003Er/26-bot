/**
 * commands/pinterest.js
 * Download picha au video kutoka Pinterest — Toleo la 26-TECH
 */

import axios from 'axios';

export const name        = 'pinterest';
export const description = 'Download picha au video kutoka Pinterest';
export const category    = 'media';
export const use         = '<link ya pinterest>';
export const alias       = ['pin', 'pindl'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(from, { 
            text: `❌ Tafadhali weka link ya Pinterest.\nMfano: .pin https://pin.it/xxxx` 
        }, { quoted: msg });
    }

    try {
        await sock.sendMessage(from, { text: '⏳ *Natafuta na kupakua kutoka Pinterest...*' }, { quoted: msg });

        const response = await axios.get(`https://api.vreden.my.id/api/pinterest?url=${encodeURIComponent(text)}`);
        
        if (!response.data || !response.data.result) {
            throw new Error('No result from Pinterest API');
        }

        const result = response.data.result;
        const mediaUrl = result.url || result.image || result.video;
        const isVideo = result.isVideo || text.includes('/video/') || (mediaUrl && mediaUrl.includes('.mp4'));

        const caption = `📌 *Pinterest Downloader*\n\n_⚡ Powered by 26-𝚃𝙴𝙲𝙷_`;

        if (isVideo) {
            await sock.sendMessage(from, {
                video: { url: mediaUrl },
                mimetype: 'video/mp4',
                caption: caption
            }, { quoted: msg });
        } else {
            await sock.sendMessage(from, {
                image: { url: mediaUrl },
                caption: caption
            }, { quoted: msg });
        }
    } catch (error) {
        console.error('Pinterest error:', error);
        await sock.sendMessage(from, { text: '❌ Imeshindwa kupakua faili la Pinterest kwa sasa.' }, { quoted: msg });
    }
}
