/**
 * commands/magicstudio.js
 * Generate AI Art kutoka maandishi — Toleo la ES Modules la 26-TECH
 */

import axios from 'axios';

export const name        = 'imagine';
export const description = 'Tengeneza picha ya AI kutoka maandishi';
export const category    = 'ai';
export const use         = '<maelezo ya picha>';
export const alias       = ['magic', 'magicai', 'generate'];
export const adminOnly   = false;

const BASE = 'https://api.siputzx.my.id/api/ai/magicstudio';

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const prompt = args.join(' ').trim();

    if (!prompt) {
        return await sock.sendMessage(from, {
            text: `❌ Tafadhali andika maelezo ya picha.\nMfano: .imagine a cyberpunk city at night`
        }, { quoted: msg });
    }

    try {
        await sock.sendMessage(from, { text: '🎨 *Ninatengeneza picha yako ya AI, subiri kidogo...*' }, { quoted: msg });

        const url = `${BASE}?prompt=${encodeURIComponent(prompt)}`;
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': '*/*'
            },
            timeout: 120000
        });

        const imageBuffer = Buffer.from(response.data);

        if (!imageBuffer || imageBuffer.length === 0) {
            throw new Error('Picha haikupatikana kutoka API');
        }

        const maxImageSize = 5 * 1024 * 1024; // 5MB
        if (imageBuffer.length > maxImageSize) {
            throw new Error(`Picha ni kubwa sana: ${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB (max 5MB)`);
        }

        await sock.sendMessage(from, {
            image: imageBuffer,
            caption: `🎨 *AI Art*\n📝 *Prompt:* ${prompt}\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
        }, { quoted: msg });

    } catch (error) {
        console.error('MagicStudio error:', error);

        if (error.response?.status === 429) {
            await sock.sendMessage(from, { text: '❌ Ombi nyingi sana. Jaribu tena baadaye.' }, { quoted: msg });
        } else if (error.response?.status === 400) {
            await sock.sendMessage(from, { text: '❌ Maelezo si sahihi. Jaribu maelezo mengine.' }, { quoted: msg });
        } else if (error.response?.status === 500) {
            await sock.sendMessage(from, { text: '❌ Hitilafu ya seva. Jaribu tena baadaye.' }, { quoted: msg });
        } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
            await sock.sendMessage(from, { text: '❌ Muda umekwisha. Tengeneza tena picha yako.' }, { quoted: msg });
        } else {
            await sock.sendMessage(from, { text: `❌ Imeshindwa kutengeneza picha: ${error.message}` }, { quoted: msg });
        }
    }
}
