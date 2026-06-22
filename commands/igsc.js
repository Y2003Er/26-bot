/**
 * commands/igsc.js
 * Badilisha picha ya IG kuwa Cropped Square Sticker — Toleo la ES Modules la 26-TECH
 */

import APIs from '../api.js';

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
        return await sock.sendMessage(from, {
            text: '❌ Weka link ya Instagram kutengeneza square sticker.\nMfano: .igsc https://www.instagram.com/p/xxxx/'
        }, { quoted: msg });
    }

    // Angalia kama ni link ya Instagram
    const isValidUrl = /https?:\/\/(?:www\.)?(?:instagram\.com|instagr\.am)\//.test(text);
    if (!isValidUrl) {
        return await sock.sendMessage(from, {
            text: '❌ Hiyo si link halali ya Instagram.'
        }, { quoted: msg });
    }

    try {
        await sock.sendMessage(from, { text: '⏳ *Naandaa square sticker, subiri kiongozi...*' }, { quoted: msg });

        const res = await APIs.igDownload(text);

        if (!res || !res.data || res.data.length === 0) {
            return await sock.sendMessage(from, {
                text: '❌ Media haikupatikana. Post inaweza kuwa ya private.'
            }, { quoted: msg });
        }

        const mediaUrl = res.data[0].url;

        // Tengeneza cropped square sticker
        const stickerApi = `https://api.vreden.my.id/api/sticker?url=${encodeURIComponent(mediaUrl)}&pack=26-TECH&author=26-TECH&crop=true`;

        await sock.sendMessage(from, {
            sticker: { url: stickerApi }
        }, { quoted: msg });

    } catch (err) {
        console.error('IGSC error:', err);
        await sock.sendMessage(from, {
            text: '❌ Imeshindwa kutengeneza square sticker.'
        }, { quoted: msg });
    }
}
