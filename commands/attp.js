/**
 * commands/attp.js
 * Tengeneza Sticker ya maandishi yanayometa rangi tofauti — Toleo la 26-TECH
 */

export const name        = 'attp';
export const description = 'Tengeneza sticker ya maandishi yanayometa (Animated Text Sticker)';
export const category    = 'general';
export const use         = '<maandishi>';
export const alias       = ['ttp'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const chatId = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(chatId, { text: '❌ Tafadhali weka maandishi ya kutengenezea sticker.\nMfano: .attp Oya Mwanangu' }, { quoted: msg });
    }

    if (text.length > 35) {
        return await sock.sendMessage(chatId, { text: '❌ Maandishi ni marefu sana! Mwisho herufi 35 tu.' }, { quoted: msg });
    }

    try {
        await sock.sendMessage(chatId, { text: '⏳ *Naandaa sticker yako inayometa, tulia kiongozi...*' }, { quoted: msg });

        // Badala ya kuchemsha ffmpeg kule Railway na kusababisha RAM kujaa, tunatuma kwenye API safi inayotengeneza sticker ya maandishi kiwango cha juu!
        const attpApiUrl = `https://api.vreden.my.id/api/attp?text=${encodeURIComponent(text)}`;

        await sock.sendMessage(chatId, { 
            sticker: { url: attpApiUrl } 
        }, { quoted: msg });

    } catch (error) {
        console.error('ATTP error:', error);
        await sock.sendMessage(chatId, { text: '❌ Mfumo umeshindwa kutengeneza sticker ya maandishi kwa sasa.' }, { quoted: msg });
    }
}
