/**
 * commands/facebook.js
 * Download video kutoka Facebook — Inajitegemea (No External API)
 * Imeboreshwa kufuata uelekezaji na vyanzo vingi
 */

import axios from 'axios';
import { load } from 'cheerio';

export const name        = 'facebook';
export const description = 'Download video kutoka Facebook';
export const category    = 'media';
export const use         = '<link ya video ya facebook>';
export const alias       = ['fb', 'fbdl', 'onheza'];
export const adminOnly   = false;

function extractVideoFromHTML(html, finalUrl) {
    const $ = load(html);
    
    // 1. Tafuta kupitia meta tagi za Open Graph
    let videoUrl = $('meta[property="og:video"]').attr('content') ||
                   $('meta[property="og:video:url"]').attr('content') ||
                   $('meta[property="og:video:secure_url"]').attr('content');
                   
    let title = $('meta[property="og:title"]').attr('content') ||
                $('title').text() ||
                'Facebook Video';

    // 2. Kama hakuna, tafuta vyanzo vya video vya moja kwa moja
    if (!videoUrl) {
        // Tafuta HD kwanza
        const hdMatch = html.match(/"hd_src"\s*:\s*"([^"]+)"/);
        if (hdMatch) videoUrl = hdMatch[1].replace(/\\/g, '');
        
        // Kama hakuna HD, tumia SD
        if (!videoUrl) {
            const sdMatch = html.match(/"sd_src"\s*:\s*"([^"]+)"/);
            if (sdMatch) videoUrl = sdMatch[1].replace(/\\/g, '');
        }
        
        // Jaribu pia "playable_url" kwenye JSON iliyoingizwa
        if (!videoUrl) {
            const playableMatch = html.match(/"playable_url"\s*:\s*"([^"]+)"/);
            if (playableMatch) videoUrl = playableMatch[1].replace(/\\/g, '');
        }
        
        // Jaribu "browser_native_hd_url" au "browser_native_sd_url"
        if (!videoUrl) {
            const nativeMatch = html.match(/"browser_native_(?:hd|sd)_url"\s*:\s*"([^"]+)"/);
            if (nativeMatch) videoUrl = nativeMatch[1].replace(/\\/g, '');
        }
    }

    // 3. Safisha URL
    if (videoUrl) {
        videoUrl = videoUrl.replace(/\\/g, '').replace(/&amp;/g, '&');
        // Hakikisha URL ni kamili
        if (videoUrl.startsWith('/')) {
            videoUrl = 'https://www.facebook.com' + videoUrl;
        }
    }

    return { videoUrl, title };
}

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    let url = args.join(' ').trim();

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
        // Pata URL halisi kwa kufuata uelekezaji (redirects)
        let finalUrl = url;
        let html = '';
        
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5'
                },
                maxRedirects: 5,
                validateStatus: (status) => status < 400
            });
            html = response.data;
            finalUrl = response.request.res.responseUrl || url;
        } catch (firstError) {
            // Jaribu tena bila kufuata redirects ili kupata URL ya mwisho
            try {
                const headResp = await axios.head(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    maxRedirects: 0,
                    validateStatus: (status) => status >= 300 && status < 400
                });
                finalUrl = headResp.headers.location || url;
            } catch (e) {
                finalUrl = url;
            }
            
            // Chukua HTML kutoka URL ya mwisho
            if (finalUrl !== url) {
                const { data } = await axios.get(finalUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5'
                    }
                });
                html = data;
            }
        }

        let { videoUrl, title } = extractVideoFromHTML(html, finalUrl);

        // Kama bado haijapatikana, jaribu kutazama kwenye URL ya original
        if (!videoUrl && finalUrl !== url) {
            try {
                const { data: originalHtml } = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });
                const result = extractVideoFromHTML(originalHtml, url);
                if (result.videoUrl) {
                    videoUrl = result.videoUrl;
                    title = result.title || title;
                }
            } catch (e) {}
        }

        if (!videoUrl) {
            throw new Error('Video haipatikani. Inaweza kuwa ya faragha au kiungo si sahihi.');
        }

        await sock.sendMessage(from, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            caption: `*🎬 ${title || 'Facebook Video'}*\n\n_⚡ Downloaded by 26-𝚃𝙴𝙲𝙷_`
        }, { quoted: msg });

    } catch (error) {
        console.error('Facebook error:', error.message);
        await sock.sendMessage(from, {
            text: `❌ *Imeshindwa kupakua video.*\n\n*Sababu zinazowezekana:*\n• Video ni ya private\n• Link imekwisha\n• Jaribu tena baadaye`
        }, { quoted: msg });
    }
}