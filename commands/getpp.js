/**
 * commands/getpp.js
 * Kuchukua picha ya wasifu (Profile Picture) ya mtu — Toleo la 26-TECH
 */

import axios from 'axios';

export const name        = 'getpp';
export const description = 'Chukua picha ya wasifu (Profile Picture) ya mtumiaji';
export const category    = 'general';
export const use         = '(reply au tag mtu)';
export const alias       = ['gp', 'getpic', 'profile'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const chatId = msg.key.remoteJid;

    try {
        let targetUser = null;

        // Angalia kama amereply mtu
        const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quotedMessage) {
            targetUser = msg.message.extendedTextMessage.contextInfo.participant;
        } else {
            // Angalia kama amemtag mtu
            const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
            if (mentionedJid && mentionedJid.length > 0) {
                targetUser = mentionedJid[0];
            } else {
                // Kama hajatag mtu, inachukua picha yake yeye mwenyewe aliyetuma command!
                targetUser = msg.key.participant || msg.key.remoteJid || '';
            }
        }

        if (!targetUser) {
            return await sock.sendMessage(chatId, { text: '❌ Sijamtambua mtumiaji huyo.' }, { quoted: msg });
        }

        // Vuta URL ya profile picture kutoka WhatsApp yenyewe
        const ppUrl = await sock.profilePictureUrl(targetUser, 'image').catch(() => null);
        
        if (!ppUrl) {
            return await sock.sendMessage(chatId, { text: '❌ Mtumiaji huyu hana picha ya wasifu au ameiweka Private.' }, { quoted: msg });
        }

        const response = await axios.get(ppUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);
        
        await sock.sendMessage(chatId, { 
            image: buffer,
            caption: `👤 *Picha ya wasifu ya:* @${targetUser.split('@')[0]}`,
            mentions: [targetUser]
        }, { quoted: msg });

    } catch (error) {
        await sock.sendMessage(chatId, { text: '❌ Imeshindwa kuchukua picha ya wasifu kwa sasa.' }, { quoted: msg });
    }
}
