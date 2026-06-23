/**
 * commands/facebook.js
 * Download video kutoka Facebook — Toleo la 26-TECH
 */

import APIs from '../api.js';

export const name        = 'facebook';
export const description = 'Download video kutoka Facebook';
export const category    = 'media';
export const use         = '<link ya video ya facebook>';
export const alias       = ['fb', 'fbdl', 'onheza'];
export const adminOnly   = false;

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
        const { videoUrl, title } = await APIs.facebookDownload(url);

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
