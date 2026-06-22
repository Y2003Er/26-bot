/**
 * commands/tts.js
 * Badilisha maandishi kuwa sauti (Voice Note) — Toleo la 26-TECH
 */

import axios from 'axios';

export const name        = 'tts';
export const description = 'Badilisha maandishi kuwa sauti (Voice Note)';
export const category    = 'general';
export const use         = '<maandishi>';
export const alias       = ['speak', 'say'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const chatId = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(chatId, { text: '❌ Tafadhali andika maneno unayotaka niyaseme.\nMfano: .tts mambo vipi 26-tech' }, { quoted: msg });
    }

    try {
        // Tunatumia API ya haraka ya vreden kugeuza maandishi kuwa sauti ya Kiswahili/Kingereza
        const audioUrl = `https://api.vreden.my.id/api/tts?text=${encodeURIComponent(text)}&lang=en`;
        
        const audioResponse = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 30000 });
        const audioBuffer = Buffer.from(audioResponse.data);

        await sock.sendMessage(chatId, {
            audio: audioBuffer,
            mimetype: 'audio/mp4',
            ptt: true // Inatokea kama Voice Note ya kurekodi mwanangu
        }, { quoted: msg });

    } catch (error) {
        console.error('TTS command error:', error);
        await sock.sendMessage(chatId, { text: '❌ Imeshindwa kutengeneza sauti kwa sasa.' }, { quoted: msg });
    }
}
