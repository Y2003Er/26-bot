/**
 * commands/facebook.js
 * Download video kutoka Facebook — Njia ya Ndani + API ya Dharura
 */

import axios from 'axios';
import { load } from 'cheerio';

export const name        = 'facebook';
export const description = 'Download video kutoka Facebook';
export const category    = 'media';
export const use         = '<link ya video ya facebook>';
export const alias       = ['fb', 'fbdl', 'onheza'];
export const adminOnly   = false;

// Jitihada za kuchanganua (kwa video za umma kabisa)
function extractVideoFromHTML(html) {
    const $ = load(html);
    let videoUrl = $('meta[property="og:video"]').attr('content') ||
                   $('meta[property="og:video:url"]').attr('content') ||
                   $('meta[property="og:video:secure_url"]').attr('content');
    if (!videoUrl) {
        const match = html.match(/"(?:hd_src|sd_src|playable_url|browser_native_[a-z]+_url)"\s*:\s*"([^"]+)"/);
        if (match) videoUrl = match[1].replace(/\\/g, '');
    }
    return videoUrl ? videoUrl.replace(/\\/g, '').replace(/&amp;/g, '&') : null;
}

async function tryScrape(url) {
    try {
        const { data: html } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            },
            maxRedirects: 5,
            timeout: 10000
        });
        const videoUrl = extractVideoFromHTML(html);
        const $ = load(html);
        const title = $('meta[property="og:title"]').attr('content') || 'Facebook Video';
        return videoUrl ? { videoUrl, title } : null;
    } catch {
        return null;
    }
}

// Dharura: API ya bure ya fbdownloader
async function tryFbdownloader(url) {
    try {
        const apiUrl = `https://fbdownloader.app/api/download?url=${encodeURIComponent(url)}`;
        const { data } = await axios.get(apiUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000
        });
        if (data && data.success && data.data) {
            const videoUrl = data.data.hd || data.data.sd || data.data.videoUrl;
            const title = data.data.title || 'Facebook Video';
            if (videoUrl) return { videoUrl, title };
        }
        return null;
    } catch {
        return null;
    }
}

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const url  = args.join(' ').trim();

    if (!url) {
        return sock.sendMessage(from, {
            text: `❌ Weka link ya Facebook.\n\n*Mfano:*\n.fb https://www.facebook.com/watch/?v=xxxx\n.onheza https://fb.watch/xxxx`
        }, { quoted: msg });
    }

    if (!url.includes('facebook.com') && !url.includes('fb.watch')) {
        return sock.sendMessage(from, {
            text: '❌ Link siyo ya Facebook. Weka link sahihi.'
        }, { quoted: msg });
    }

    await sock.sendMessage(from, {
        text: '⏳ *Inapakua video kutoka Facebook... subiri kidogo*'
    }, { quoted: msg });

    try {
        // Jaribu kuchanganua kwanza
        let result = await tryScrape(url);

        // Ikishindikana, tumia API ya dharura
        if (!result) {
            result = await tryFbdownloader(url);
        }

        if (!result || !result.videoUrl) {
            throw new Error('Video haipatikani');
        }

        await sock.sendMessage(from, {
            video: { url: result.videoUrl },
            mimetype: 'video/mp4',
            caption: `*🎬 ${result.title}*\n\n_⚡ Downloaded by 26-𝚃𝙴𝙲𝙷_`
        }, { quoted: msg });

    } catch (error) {
        console.error('Facebook error:', error.message);
        await sock.sendMessage(from, {
            text: `❌ *Imeshindwa kupakua video.*\n\n*Sababu zinazowezekana:*\n• Video ni ya private\n• Link imekwisha\n• Jaribu tena baadaye`
        }, { quoted: msg });
    }
}