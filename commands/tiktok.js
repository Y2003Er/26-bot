/**
 * commands/tiktok.js
 * Download video kutoka TikTok bila watermark — Toleo la ES Modules la 26-TECH
 */

import APIs from '../api.js';

export const name        = 'tiktok';
export const description = 'Download video kutoka TikTok bila watermark';
export const category    = 'media';
export const use         = '<link ya TikTok>';
export const alias       = ['tt', 'ttdl', 'tiktokdl'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(from, {
            text: `❌ Tafadhali weka link halali ya TikTok video.\nMfano: .tiktok https://vm.tiktok.com/xxxx/`
        }, { quoted: msg });
    }

    try {
        await sock.sendMessage(from, { text: '⏳ *Nainyonya video kutoka TikTok, tulia kiongozi...*' }, { quoted: msg });

        const result = await APIs.getTikTokDownload(text);

        if (!result || !result.videoUrl) {
            return await sock.sendMessage(from, {
                text: '❌ TikTok video haijapatikana. Hakikisha link yako ni sahihi.'
            }, { quoted: msg });
        }

        const { videoUrl, title } = result;

        await sock.sendMessage(from, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            caption: `🎵 *${title || 'TikTok Video'}*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
        }, { quoted: msg });

    } catch (error) {
        console.error('TikTok downloader error:', error);
        await sock.sendMessage(from, {
            text: '❌ Imeshindwa kupakua video hiyo. Hakikisha link yako ni sahihi.'
        }, { quoted: msg });
    }
}
