/**
 * commands/magicstudio.js
 * Generate AI Art kutoka maandishi — Toleo la Uhakika la 26-TECH
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
        
        // 1. Kwanza tunapiga hodi kwa mtindo wa kawaida ili kuona kama inaleta JSON au Picha ya moja kwa moja
        console.log(`🔄 [26-TECH] Kujaribu MagicStudio API kwa prompt: ${prompt}`);
        
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 60000 // Sekunde 60 zinatosha sana
        });

        let imageUrl = url; // Default ikiwa inatupa picha moja kwa moja

        // Kama API inarudisha JSON yenye link ya picha (Kama zilivyo nyingi za Siputzx)
        if (response.data && typeof response.data === 'object') {
            if (response.data.data) imageUrl = response.data.data;
            else if (response.data.result) imageUrl = response.data.result;
            else if (response.data.url) imageUrl = response.data.url;
        }

        // 2. Sasa tunaipitishia Baileys link ya picha moja kwa moja. 
        // Uzuri wa Baileys ni kwamba ukiipa { url: ... }, inajua yenyewe jinsi ya ku-download na kutuma bila kula RAM yako!
        await sock.sendMessage(from, {
            image: { url: imageUrl },
            caption: `🎨 *AI Art*\n📝 *Prompt:* ${prompt}\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
        }, { quoted: msg });

        console.log('✅ [26-TECH] Picha ya AI imetumwa kwa mafanikio!');

    } catch (error) {
        console.error('MagicStudio error:', error);

        // Kushughulikia makosa kwa usahihi
        if (error.response?.status === 429) {
            await sock.sendMessage(from, { text: '❌ Ombi nyingi sana (Rate limit). Jaribu tena baadaye.' }, { quoted: msg });
        } else if (error.response?.status === 400) {
            await sock.sendMessage(from, { text: '❌ Maelezo si sahihi au neno lililokatazwa. Jaribu maelezo mengine.' }, { quoted: msg });
        } else if (error.response?.status === 500) {
            await sock.sendMessage(from, { text: '❌ Hitilafu ya seva ya AI. Jaribu tena baadaye.' }, { quoted: msg });
        } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
            await sock.sendMessage(from, { text: '❌ Muda umekwisha kabla picha haijakamilika. Jaribu tena.' }, { quoted: msg });
        } else {
            await sock.sendMessage(from, { text: `❌ Imeshindwa kutengeneza picha: ${error.message}` }, { quoted: msg });
        }
    }
}
