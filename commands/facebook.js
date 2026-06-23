/**
 * commands/facebook.js
 * Download video kutoka Facebook — Inajitegemea (No External API)
 */

import axios from 'axios';
import { load } from 'cheerio';

export const name        = 'facebook';
export const description = 'Download video kutoka Facebook';
export const category    = 'media';
export const use         = '<link ya video ya facebook>';
export const alias       = ['fb', 'fbdl', 'onheza'];
export const adminOnly   = false;

function extractVideoFromHTML(html, url) {
    const $ = load(html);
    
    // 1. Tafuta kupitia meta tagi za Open Graph
    let videoUrl = $('meta[property="og:video"]').attr('content');
    let title    = $('meta[property="og:title"]').attr('content') || 'Facebook Video';

    // 2. Kama hakuna, tafuta vyanzo vya video vya moja kwa moja (FB huzipachika hivi)
    if (!videoUrl) {
        // Tafuta HD kwanza
        const hdMatch = html.match(/"hd_src":"(.*?)"/);
        if (hdMatch) videoUrl = hdMatch[1];
        
        // Kama hakuna HD, tumia SD
        if (!videoUrl) {
            const sdMatch = html.match(/"sd_src":"(.*?)"/);
            if (sdMatch) videoUrl = sdMatch[1];
        }
    }

    // 3. Safisha URL (baadhi ya viungo huwa na escapement)
    if (videoUrl) {
        videoUrl = videoUrl.replace(/\\/g, '').replace(/&amp;/g, '&');
    }

    return { videoUrl, title };
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
        // Chukua HTML ya ukurasa kama kivinjari cha kawaida
        const { data: html } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        });

        const { videoUrl, title } = extractVideoFromHTML(html, url);

        if (!videoUrl) {
            throw new Error('Video haipatikani. Inaweza kuwa ya faragha au kiungo si sahihi.');
        }

        await sock.sendMessage(from, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            caption: `*🎬 ${title}*\n\n_⚡ Downloaded by 26-𝚃𝙴𝙲𝙷_`
        }, { quoted: msg });

    } catch (error) {
        console.error('Facebook error:', error.message);
        await sock.sendMessage(from, {
            text: `❌ *Imeshindwa kupakua video.*\n\n*Sababu zinazowezekana:*\n• Video ni ya private\n• Link imekwisha\n• Jaribu tena baadaye`
        }, { quoted: msg });
    }
}