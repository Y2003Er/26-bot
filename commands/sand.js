/**
 * commands/sand.js
 * Tengeneza Sand text effect — Toleo la ES Modules la 26-TECH
 */

import mumaker from 'mumaker';

export const name        = 'sand';
export const description = 'Tengeneza sand text effect';
export const category    = 'textmaker';
export const use         = '<maandishi>';
export const alias       = [];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const chatId = msg.key.remoteJid;
    const text   = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(chatId, {
            text: '❌ Andika maandishi.\nMfano: .sand 26-TECH'
        }, { quoted: msg });
    }

    try {
        await sock.sendMessage(chatId, { text: '⏳ *Ninatengeneza sand effect, subiri...*' }, { quoted: msg });

        const result = await mumaker.ephoto(
            'https://en.ephoto360.com/write-names-and-messages-on-the-sand-online-582.html',
            text
        );

        if (!result?.image) throw new Error('Picha haikupatikana kutoka API');

        await sock.sendMessage(chatId, {
            image:   { url: result.image },
            caption: `🏖️ *Sand Effect*\n📝 ${text}\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
        }, { quoted: msg });

    } catch (error) {
        console.error('Sand error:', error);
        await sock.sendMessage(chatId, {
            text: `❌ Imeshindwa kutengeneza: ${error.message}`
        }, { quoted: msg });
    }
}
