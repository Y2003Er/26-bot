/**
 * commands/translate.js
 * Tafsiri lugha kwenda lugha nyingine — Toleo la 26-TECH
 */

import axios from 'axios';

export const name        = 'translate';
export const description = 'Tafsiri maandishi kwenda lugha nyingine';
export const category    = 'general';
export const use         = '<code ya lugha> <maandishi>';
export const alias       = ['tr', 'trans'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const chatId = msg.key.remoteJid;

    if (args.length < 2) {
        return await sock.sendMessage(chatId, { 
            text: '❌ *Matumizi:* .translate <code_ya_lugha> <maandishi>\nMfano: .translate sw Hello world (Inatafsiri kwenda Kiswahili)' 
        }, { quoted: msg });
    }

    const targetLang = args[0].toLowerCase();
    const text = args.slice(1).join(' ');

    try {
        const response = await axios.get(`https://api.vreden.my.id/api/translate?text=${encodeURIComponent(text)}&to=${targetLang}`);
        
        if (!response.data || !response.data.result) {
            throw new Error('Translation failed');
        }

        let replyText = `🌐 *26-TECH TRANSLATION*\n\n`;
        replyText += `📝 *Original:* ${text}\n`;
        replyText += `🔤 *Translated:* ${response.data.result}\n`;
        replyText += `🌍 *Language:* ${targetLang.toUpperCase()}`;

        await sock.sendMessage(chatId, { text: replyText }, { quoted: msg });
    } catch (error) {
        await sock.sendMessage(chatId, { 
            text: `❌ Imeshindwa kutafsiri. Hakikisha code ni sahihi (Mfano: sw, en, es, fr, ar)` 
        }, { quoted: msg });
    }
}
