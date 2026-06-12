import yts from 'yt-search';
import axios from 'axios';

export default async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(from, {
            text: '❌ Andika jina la wimbo\nMfano:.song sza snooze'
        }, { quoted: msg });
    }

    try {
        await sock.sendMessage(from, { text: '⏳ *Natafuta wimbo...*' }, { quoted: msg });

        let videoUrl;
        if (text.startsWith('http')) {
            videoUrl = text;
        } else {
            const { videos } = await yts(text);
            if (!videos?.length) {
                return await sock.sendMessage(from, { text: '❌ Wimbo haukupatikana' }, { quoted: msg });
            }
            videoUrl = videos[0].url;
        }

        const { data } = await axios.post('https://api.cobalt.tools/api/json', {
            url: videoUrl,
            isAudioOnly: true,
            audioFormat: 'mp3',
            audioBitrate: '128'
        }, {
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            timeout: 60000
        });

        if (data.status!== 'success') {
            throw new Error(data.error || 'Cobalt failed');
        }

        await sock.sendMessage(from, {
            audio: { url: data.url },
            mimetype: 'audio/mpeg',
            fileName: `${data.filename || 'song.mp3'}`
        }, { quoted: msg });

    } catch (error) {
        console.error('Song Error:', error.message);
        await sock.sendMessage(from, {
            text: '❌ Imeshindwa kupakua. Jaribu tena.'
        }, { quoted: msg });
    }
}