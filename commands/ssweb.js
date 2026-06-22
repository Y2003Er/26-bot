/**
 * commands/ssweb.js
 * Piga picha (Screenshot) ya tovuti yoyote — Toleo la 26-TECH
 * v2: Ina APIs 3 za bure (fallback chain) — vreden imekufa, hizi mbadala hazihitaji key
 */

import axios from 'axios';

export const name        = 'ssweb';
export const description = 'Piga picha (Screenshot) ya tovuti yoyote';
export const category    = 'general';
export const use         = '<link ya website>';
export const alias       = ['screenshot', 'ss', 'webss'];
export const adminOnly   = false;

// Orodha ya APIs — zitajaribiwa moja baada ya nyingine mpaka moja ifanikiwe
const SS_PROVIDERS = [
    {
        name: 'microlink',
        build: (url) =>
            `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url&force=true&waitForTimeout=3000`
    },
    {
        name: 'thum.io',
        build: (url) =>
            `https://image.thum.io/get/width/1280/crop/900/wait/3/noanimate/${url}`
    },
    {
        name: 'wordpress-mshots',
        build: (url) =>
            `https://s0.wp.com/mshots/v1/${encodeURIComponent(url)}?w=1280&h=900`
    }
];

async function fetchScreenshot(url) {
    let lastError = null;

    for (const provider of SS_PROVIDERS) {
        try {
            const ssUrl = provider.build(url);
            const response = await axios.get(ssUrl, {
                responseType: 'arraybuffer',
                timeout: 25000,
                maxRedirects: 5,
                headers: { 'User-Agent': 'Mozilla/5.0 (26-Tech-Bot)' }
            });

            const buffer = Buffer.from(response.data);
            const contentType = response.headers['content-type'] || '';

            // Hakikisha tumepata picha halisi, sio JSON ya error au ukurasa mtupu
            if (buffer.length > 1500 && contentType.startsWith('image/')) {
                return { buffer, provider: provider.name };
            }

            lastError = new Error(`${provider.name}: jibu si picha sahihi (${contentType}, ${buffer.length} bytes)`);
        } catch (err) {
            lastError = err;
            console.error(`SSWeb [${provider.name}] error:`, err.message);
        }
    }

    throw lastError || new Error('APIs zote zimeshindwa');
}

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

        const { buffer, provider } = await fetchScreenshot(url);

        await sock.sendMessage(chatId, {
            image: buffer,
            caption: `✅ *Screenshot ya:* ${url}\n\n_⚡ Powered by 26-𝚃𝙴𝙲𝙷 (${provider})_`
        }, { quoted: msg });

    } catch (error) {
        console.error('SSWeb error (APIs zote):', error);
        await sock.sendMessage(chatId, { text: '❌ Imeshindwa kupiga picha tovuti hiyo. Tovuti inaweza ikawa imelala, au APIs zote za screenshot zina shida kwa sasa.' }, { quoted: msg });
    }
}
