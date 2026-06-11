/**
 * commands/viewonce.js
 * Kufunua meseji za View-Once (Picha/Video/Audio) — Toleo la 26-TECH
 */

import { downloadContentFromMessage } from '@whiskeysockets/baileys';

export const name        = 'viewonce';
export const description = 'Funua meseji za view-once (picha/video/audio)';
export const category    = 'general';
export const use         = '(reply meseji ya view-once)';
export const alias       = ['readvo', 'read', 'vv', 'readviewonce'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const chatId = msg.key.remoteJid;

    try {
        const ctx = msg.message?.extendedTextMessage?.contextInfo
            || msg.message?.imageMessage?.contextInfo
            || msg.message?.videoMessage?.contextInfo
            || msg.message?.buttonsResponseMessage?.contextInfo
            || msg.message?.listResponseMessage?.contextInfo;

        if (!ctx?.quotedMessage) {
            return await sock.sendMessage(chatId, { 
                text: '🗑️ *Tafadhali reply meseji ya VIEW-ONCE ili niifunue kashabiki!*' 
            }, { quoted: msg });
        }

        const quotedMsg = ctx.quotedMessage;
        const actualMsg = quotedMsg.viewOnceMessageV2?.message 
            || quotedMsg.viewOnceMessageV2Extension?.message 
            || quotedMsg.viewOnceMessage?.message 
            || quotedMsg;

        const mtype = Object.keys(actualMsg)[0];

        if (!/imageMessage|videoMessage|audioMessage/.test(mtype)) {
            return await sock.sendMessage(chatId, { 
                text: '❌ Hii sio meseji halali ya View-Once ya picha, video au audio.' 
            }, { quoted: msg });
        }

        await sock.sendMessage(chatId, { text: '⏳ *Nafungua mzigo wa siri, subiri kidogo...*' }, { quoted: msg });

        const downloadType = mtype === 'imageMessage' ? 'image' 
            : mtype === 'videoMessage' ? 'video' 
            : 'audio';

        const mediaStream = await downloadContentFromMessage(actualMsg[mtype], downloadType);

        let buffer = Buffer.from([]);
        for await (const chunk of mediaStream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        const caption = actualMsg[mtype]?.caption || '*🔓 Mzigo wa View-Once Umefunuliwa!*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*';

        if (/video/.test(mtype)) {
            await sock.sendMessage(chatId, { video: buffer, caption, mimetype: 'video/mp4' }, { quoted: msg });
        } else if (/image/.test(mtype)) {
            await sock.sendMessage(chatId, { image: buffer, caption, mimetype: 'image/jpeg' }, { quoted: msg });
        } else if (/audio/.test(mtype)) {
            await sock.sendMessage(chatId, { audio: buffer, ptt: true, mimetype: 'audio/ogg; codecs=opus' }, { quoted: msg });
        }

    } catch (error) {
        console.error('Error in viewonce command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Kushindwa kufungua meseji hii ya view-once.' 
        }, { quoted: msg });
    }
}
