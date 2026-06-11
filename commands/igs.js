/**
 * commands/igs.js
 * Badilisha picha ya IG kuwa sticker (Aspect Ratio) — Toleo la ES Modules la 26-TECH
 */

import APIs from '../api.js';

export const name        = 'igs';
export const description = 'Badilisha picha/video ya Instagram kuwa sticker (full aspect ratio)';
export const category    = 'media';
export const use         = '<link ya instagram>';
export const alias       = ['igsticker'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(from, {
            text: '❌ Weka link halali ya Instagram.\nMfano: .igs https://www.instagram.com/p/xxxx/'
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
        await sock.sendMessage(from, { text: '⏳ *Naandaa sticker yako kutoka Instagram...*' }, { quoted: msg });

        const res = await APIs.igDownload(text);

        if (!res || !res.data || res.data.length === 0) {
            return await sock.sendMessage(from, {
                text: '❌ Sijapata picha kwenye hiyo link. Post inaweza kuwa ya private.'
            }, { quoted: msg });
        }

        const mediaUrl = res.data[0].url;

        // Tengeneza sticker kwa API — full aspect ratio
        const stickerApi = `https://api.vreden.my.id/api/sticker?url=${encodeURIComponent(mediaUrl)}&pack=26-TECH&author=26-TECH`;

        await sock.sendMessage(from, {
            sticker: { url: stickerApi }
        }, { quoted: msg });

    } catch (err) {
        console.error('IGS error:', err);
        await sock.sendMessage(from, {
            text: '❌ Imeshindwa kutengeneza sticker kutoka Instagram.'
        }, { quoted: msg });
    }
}
