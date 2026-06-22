/**
 * commands/qr.js
 * Tengeneza QR Code kutoka kwenye maandishi/link — Toleo la 26-TECH
 */

export const name        = 'qr';
export const description = 'Tengeneza QR Code kutoka kwenye maandishi au link';
export const category    = 'general';
export const use         = '<maandishi au link>';
export const alias       = ['qrcode'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const chatId = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(chatId, { text: '❌ Andika maneno au link ya kutengenezea QR.\nMfano: .qr https://github.com' }, { quoted: msg });
    }

    try {
        // Tunatumia API ya wazi ya kuaminika ili tusiweke maktaba nzito za qr kwenye boti yetu
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(text)}`;

        await sock.sendMessage(chatId, {
            image: { url: qrApiUrl },
            caption: `✅ *QR Code Tayari!*\n\n📝 *Data:* ${text}\n\n_⚡ Powered by 26-𝚃𝙴𝙲𝙷_`
        }, { quoted: msg });

    } catch (error) {
        await sock.sendMessage(chatId, { text: `❌ Imeshindwa kutengeneza QR Code kwa sasa.` }, { quoted: msg });
    }
}
