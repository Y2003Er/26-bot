/**
 * commands/song.js
 * Download audio kutoka YouTube — Toleo la 26-TECH
 */

import yts from 'yt-search';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const name        = 'song';
export const description = 'Download audio kutoka YouTube';
export const category    = 'media';
export const use         = '<jina la wimbo au link>';
export const alias       = ['play', 'music', 'yta'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(from, { 
            text: `❌ Tafadhali andika jina la wimbo au uweke link ya YouTube.\nMfano: .song Harmonize Single` 
        }, { quoted: msg });
    }

    try {
        await sock.sendMessage(from, { text: '⏳ *Natafuta na kuandaa wimbo wako, subiri kidogo...*' }, { quoted: msg });
        
        const search = await yts(text);
        const video = search.videos[0];

        if (!video) {
            return await sock.sendMessage(from, { text: '❌ Wimbo haujapatikana, jaribu tena kwa jina lingine.' }, { quoted: msg });
        }

        // Tunatumia API ya EliteProTech kwa ajili ya kudownload audio mwanangu
        const apiUrl = `https://api.eliteprotech.my.id/api/download/ytmp3?url=${encodeURIComponent(video.url)}`;
        const response = await axios.get(apiUrl);
        
        if (!response.data || !response.data.result || !response.data.result.download) {
            throw new Error('Download link missing from API');
        }

        const downloadUrl = response.data.result.download;
        const songTitle = response.data.result.title || video.title;

        // Tuma Audio direct kwa mtumiaji
        await sock.sendMessage(from, {
            audio: { url: downloadUrl },
            mimetype: 'audio/mp4',
            fileName: `${songTitle}.mp3`,
            caption: `*🎵 ${songTitle}*\n\n_⚡ Powered by 26-𝚃𝙴𝙲𝙷_`
        }, { quoted: msg });

    } catch (err) {
        console.error('Song command error:', err);
        await sock.sendMessage(from, { text: '❌ Imeshindwa kupakua wimbo huu kwa sasa. Jaribu tena baadae.' }, { quoted: msg });
    }
}
