import yts from 'yt-search';
import axios from 'axios';

export default async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(from, {
            text: '❌ Andika jina la video\nMfano:.video one dance'
        }, { quoted: msg });
    }

    try {
        await sock.sendMessage(from, { text: '⏳ *Natafuta video...*' }, { quoted: msg });

        let videoUrl;
        if (text.startsWith('http')) {
            videoUrl = text;
        } else {
            const { videos } = await yts(text);
            if (!videos?.length) {
                return await sock.sendMessage(from, { text: '❌ Video haikupatikana' }, { quoted: msg });
            }
            videoUrl = videos[0].url;
        }

        const { data } = await axios.post('https://api.cobalt.tools/api/json', {
            url: videoUrl,
            isAudioOnly: false,
            videoQuality: '360',
            videoFormat: 'mp4'
        }, {
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            timeout: 120000
        });

        if (data.status!== 'success') {
            throw new Error(data.error || 'Cobalt failed');
        }

        await sock.sendMessage(from, {
            video: { url: data.url },
            caption: `> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`,
            mimetype: 'video/mp4'
        }, { quoted: msg });

    } catch (error) {
        console.error('Video Error:', error.message);
        await sock.sendMessage(from, {
            text: '❌ Imeshindwa kupakua. Jaribu tena.'
        }, { quoted: msg });
    }
}