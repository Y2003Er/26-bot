/**
 * commands/facebook.js
 * Download video kutoka Facebook — Toleo la 26-TECH
 */

import axios from 'axios';

export const name        = 'facebook';
export const description = 'Download video kutoka Facebook';
export const category    = 'media';
export const use         = '<link ya video ya facebook>';
export const alias       = ['fb', 'fbdl'];
export const adminOnly   = false;

// ── Jaribu API moja moja mpaka moja ifanye kazi ──
async function getFbVideo(url) {

    // API 1: fdownloader
    try {
        const res = await axios.get(
            `https://api.fdownloader.net/api/download?url=${encodeURIComponent(url)}&hd=1`,
            { timeout: 10000 }
        );
        const data = res.data;
        // kawaida inarudisha { success: true, links: [{url, quality}] }
        if (data?.success && data?.links?.length) {
            const hd = data.links.find(l => l.quality?.includes('HD')) || data.links[0];
            return { videoUrl: hd.url, title: data.title || 'Facebook Video' };
        }
    } catch (_) {}

    // API 2: SnapSave (API isiyo rasmi lakini inafanya kazi)
    try {
        const res = await axios.post(
            'https://snapsave.app/action.php',
            new URLSearchParams({ url }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
        );
        // response ni HTML — toa link ya video
        const match = res.data.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/);
        if (match?.[1]) {
            return { videoUrl: match[1], title: 'Facebook Video' };
        }
    } catch (_) {}

    // API 3: vreden (ya zamani yako — kama backup)
    try {
        const res = await axios.get(
            `https://api.vreden.my.id/api/facebook?url=${encodeURIComponent(url)}`,
            { timeout: 10000 }
        );
        const videoUrl = res.data?.result?.videoUrl
                      || res.data?.result?.hdUrl
                      || res.data?.result?.sdUrl;
        if (videoUrl) {
            return { videoUrl, title: res.data?.result?.title || 'Facebook Video' };
        }
    } catch (_) {}

    return null;
}

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(from, {
            text: `❌ Weka link halali ya Facebook video.\nMfano: .fb https://www.facebook.com/watch/?v=xxxx`
        }, { quoted: msg });
    }

    // Angalia kama link ni ya Facebook
    if (!text.includes('facebook.com') && !text.includes('fb.watch')) {
        return await sock.sendMessage(from, {
            text: '❌ Link siyo ya Facebook. Weka link sahihi.'
        }, { quoted: msg });
    }

    try {
        await sock.sendMessage(from, {
            text: '⏳ *Nainyonya video kutoka Facebook, subiri...*'
        }, { quoted: msg });

        const result = await getFbVideo(text);

        if (!result?.videoUrl) {
            throw new Error('Hakuna video iliyopatikana');
        }

        await sock.sendMessage(from, {
            video: { url: result.videoUrl },
            mimetype: 'video/mp4',
            caption: `*🎬 ${result.title}*\n\n_⚡ Downloaded by 26-𝚃𝙴𝙲𝙷_`
        }, { quoted: msg });

    } catch (error) {
        console.error('Facebook error:', error.message);
        await sock.sendMessage(from, {
            text: '❌ Kushindwa kupakua video hii.\n\n*Sababu zinazowezekana:*\n• Video ni ya private\n• Link imekwisha\n• Jaribu tena baadaye'
        }, { quoted: msg });
    }
}