/**
 * commands/igs.js
 * Badilisha picha ya IG kuwa sticker bila kuikata (Aspect Ratio Filter) — Toleo la 26-TECH
 */

import { igdl } from 'ruhend-scraper';
import axios from 'axios';

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
        return await sock.sendMessage(from, { text: '❌ Weka link halali ya Instagram.' }, { quoted: msg });
    }

    try {
        await sock.sendMessage(from, { text: '⏳ *Naandaa sticker yako kutoka Instagram...*' }, { quoted: msg });

        const res = await igdl(text);
        if (!res || !res.data || res.data.length === 0) {
            return await sock.sendMessage(from, { text: '❌ Sijapata picha kwenye hiyo link.' }, { quoted: msg });
        }

        // Tunachukua picha ya kwanza mwanangu
        const mediaUrl = res.data[0].url;

        // Tunatumia API yetu ya kutengeneza Sticker kwa urahisi na usalama bila child_process crashing
        const stickerApi = `https://api.vreden.my.id/api/sticker?url=${encodeURIComponent(mediaUrl)}&pack=26-TECH&author=Yusuph`;

        await sock.sendMessage(from, { 
            sticker: { url: stickerApi } 
        }, { quoted: msg });

    } catch (err) {
        console.error('IGS error:', err);
        await sock.sendMessage(from, { text: '❌ Imeshindwa kutengeneza sticker kutoka Instagram.' }, { quoted: msg });
    }
}
