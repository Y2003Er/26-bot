/**
 * commands/lyrics.js
 * Tafuta mashairi ya nyimbo — Toleo la 26-TECH
 */

import axios from 'axios';

export const name        = 'lyrics';
export const description = 'Tafuta mashairi (lyrics) ya wimbo wowote';
export const category    = 'media';
export const use         = '<jina la wimbo>';
export const alias       = ['lyric', 'lirik'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const query = args.join(' ').trim();

    if (!query) {
        return await sock.sendMessage(from, { 
            text: `❌ Tafadhali andika jina la wimbo.\nMfano: .lyrics Diamond Platnumz Komba` 
        }, { quoted: msg });
    }

    try {
        await sock.sendMessage(from, { text: '⏳ *Natafuta mashairi ya wimbo huo, subiri kidogo...*' }, { quoted: msg });

        const response = await axios.get(`https://api.vreden.my.id/api/lyrics?query=${encodeURIComponent(query)}`);
        
        if (!response.data || !response.data.result) {
            return await sock.sendMessage(from, { text: '❌ Mashairi hayajapatikana.' }, { quoted: msg });
        }

        const data = response.data.result;
        let lyrics = data.lyrics || '';
        
        if (lyrics.length > 4000) {
            lyrics = lyrics.substring(0, 4000) + '\n\n_(Yaliyobaki yamekatwa kwa sababu ya urefu...)_';
        }

        const caption = `🎵 *${data.title || query}*\n👤 *Msanii:* ${data.artist || 'Unknown'}\n\n📝 *MASHAIRI:*\n\n${lyrics}\n\n_⚡ Fetched by 26-𝚃𝙴𝙲𝙷_`;

        if (data.thumbnail || data.image) {
            await sock.sendMessage(from, {
                image: { url: data.thumbnail || data.image },
                caption: caption
            }, { quoted: msg });
        } else {
            await sock.sendMessage(from, { text: caption }, { quoted: msg });
        }
    } catch (error) {
        console.error('Lyrics error:', error);
        await sock.sendMessage(from, { text: '❌ Mfumo umeshindwa kutafuta lyrics kwa sasa.' }, { quoted: msg });
    }
}
