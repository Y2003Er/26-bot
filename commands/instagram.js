/**
 * commands/instagram.js
 * Download Instagram photos/videos/reels — Toleo la ES Modules la 26-TECH
 */

import APIs from '../api.js';

export const name        = 'instagram';
export const description = 'Download picha/video/reels kutoka Instagram';
export const category    = 'media';
export const use         = '<link ya Instagram>';
export const alias       = ['ig', 'insta', 'igdl', 'reels'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(from, {
            text: `❌ Tafadhali weka link ya Instagram.\nMfano: .ig https://www.instagram.com/reel/xxxx/`
        }, { quoted: msg });
    }

    // Angalia kama link ni ya Instagram
    const instagramPatterns = [
        /https?:\/\/(?:www\.)?instagram\.com\//,
        /https?:\/\/(?:www\.)?instagr\.am\//,
    ];
    const isValidUrl = instagramPatterns.some(p => p.test(text));

    if (!isValidUrl) {
        return await sock.sendMessage(from, {
            text: '❌ Hiyo si link halali ya Instagram. Tafadhali weka link sahihi ya post, reel, au video.'
        }, { quoted: msg });
    }

    try {
        await sock.sendMessage(from, { text: '⏳ *Naipakua media yako kutoka Instagram, subiri kidogo...*' }, { quoted: msg });

        const data = await APIs.igDownload(text);

        if (!data || !data.data || data.data.length === 0) {
            return await sock.sendMessage(from, {
                text: '❌ Hakuna media iliyopatikana. Post inaweza kuwa ya private au link si sahihi.'
            }, { quoted: msg });
        }

        // Ondoa URL zinazofanana
        const seenUrls = new Set();
        const uniqueMedia = data.data.filter(m => {
            if (!m.url || seenUrls.has(m.url)) return false;
            seenUrls.add(m.url);
            return true;
        }).slice(0, 20);

        for (let i = 0; i < uniqueMedia.length; i++) {
            try {
                const media = uniqueMedia[i];
                const mediaUrl = media.url;

                const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(mediaUrl) ||
                                media.type === 'video' ||
                                text.includes('/reel/') ||
                                text.includes('/tv/');

                if (isVideo) {
                    await sock.sendMessage(from, {
                        video: { url: mediaUrl },
                        mimetype: 'video/mp4',
                        caption: `🎬 *Instagram Video*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
                    }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, {
                        image: { url: mediaUrl },
                        caption: `🖼️ *Instagram Photo*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
                    }, { quoted: msg });
                }

                // Pumzika kati ya downloads kuzuia rate limit
                if (i < uniqueMedia.length - 1) {
                    await new Promise(r => setTimeout(r, 1000));
                }

            } catch (mediaError) {
                console.error(`❌ Media ${i + 1} imefeli:`, mediaError);
            }
        }

    } catch (error) {
        console.error('Instagram fatal error:', error);
        await sock.sendMessage(from, {
            text: `❌ Hitilafu ya mfumo: ${error.message}`
        }, { quoted: msg });
    }
}
