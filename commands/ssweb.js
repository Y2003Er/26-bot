/**
 * commands/ssweb.js
 * Piga picha (Screenshot) ya tovuti yoyote — Toleo la 26-TECH
 */

import axios from 'axios';

export const name        = 'ssweb';
export const description = 'Piga picha (Screenshot) ya tovuti yoyote';
export const category    = 'general';
export const use         = '<link ya website>';
export const alias       = ['screenshot', 'ss', 'webss'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const chatId = msg.key.remoteJid;
    let url = args.join(' ').trim();

    if (!url) {
        return await sock.sendMessage(chatId, { text: '❌ Weka link ya tovuti.\nMfano: .ssweb https://github.com' }, { quoted: msg });
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    try {
        await sock.sendMessage(chatId, { react: { text: '📸', key: msg.key } });

        const ssUrl = `https://api.vreden.my.id/api/ssweb?url=${encodeURIComponent(url)}&type=desktop`;
        const response = await axios.get(ssUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);

        await sock.sendMessage(chatId, {
            image: buffer,
            caption: `✅ *Screenshot ya:* ${url}\n\n_⚡ Powered by 26-𝚃𝙴𝙲𝙷_`
        }, { quoted: msg });

    } catch (error) {
        console.error('SSWeb error:', error);
        await sock.sendMessage(chatId, { text: '❌ Imeshindwa kupiga picha tovuti hiyo. Tovuti inaweza ikawa imelala.' }, { quoted: msg });
    }
}
