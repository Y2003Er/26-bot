/**
 * commands/igsc.js
 * Badilisha picha ya IG kuwa Sticker ya mraba iliyokatwa (Cropped Square Sticker) — Toleo la 26-TECH
 */

import { igdl } from 'ruhend-scraper';

export const name        = 'igsc';
export const description = 'Badilisha picha/video ya Instagram kuwa cropped square sticker';
export const category    = 'media';
export const use         = '<link ya instagram>';
export const alias       = ['igstickercrop'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(from, { text: '❌ Weka link ya Instagram kutengeneza square sticker.' }, { quoted: msg });
    }

    try {
        await sock.sendMessage(from, { text: '⏳ *Naandaa square sticker, subiri kiongozi...*' }, { quoted: msg });

        const res = await igdl(text);
        if (!res || !res.data || res.data.length === 0) {
            return await sock.sendMessage(from, { text: '❌ Media haikupatikana.' }, { quoted: msg });
        }

        const mediaUrl = res.data[0].url;
        
        // Tunaiambia API itengeneze ikiwa cropped na watermarked kwa jina lako safi kabisa
        const stickerApi = `https://api.vreden.my.id/api/sticker?url=${encodeURIComponent(mediaUrl)}&pack=26-TECH&author=Yusuph-Hanigomba`;

        await sock.sendMessage(from, { 
            sticker: { url: stickerApi } 
        }, { quoted: msg });

    } catch (err) {
        console.error('IGSC error:', err);
        await sock.sendMessage(from, { text: '❌ Imeshindwa kutengeneza square sticker.' }, { quoted: msg });
    }
}
