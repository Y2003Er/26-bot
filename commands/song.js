/**
 * commands/song.js
 * Download wimbo (Audio MP3) kutoka YouTube — Toleo la ES Modules la 26-TECH
 * FIXED v3: mimetype detection + document fallback
 */

import yts from 'yt-search';

export const name        = 'song';
export const description = 'Download wimbo (MP3) kutoka YouTube';
export const category    = 'media';
export const use         = '<jina la wimbo au link>';
export const alias       = ['play', 'music', 'mp3'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(from, {
            text: `❌ Tafadhali andika jina la wimbo au uweke link.\nMfano: .song Mbosso Pawa`
        }, { quoted: msg });
    }

    const { default: axios } = await import('axios');
    const { default: APIs  } = await import('../api.js');

    try {
        await sock.sendMessage(from, { text: '⏳ *Natafuta wimbo wako, subiri kidogo...*' }, { quoted: msg });

        let videoUrl      = '';
        let videoTitle    = '';
        let videoAuthor   = '';
        let videoDuration = '';
        let videoThumb    = '';

        const getThumb = (v) => {
            if (!v) return '';
            if (typeof v.thumbnail === 'string' && v.thumbnail.startsWith('http')) return v.thumbnail;
            if (typeof v.thumbnail === 'object' && v.thumbnail !== null) {
                return v.thumbnail.hqDefault || v.thumbnail.mqDefault || v.thumbnail.sdDefault || '';
            }
            if (typeof v.image === 'string' && v.image.startsWith('http')) return v.image;
            try {
                const id = new URL(v.url).searchParams.get('v');
                if (id) return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
            } catch (_) {}
            return '';
        };

        if (text.startsWith('http://') || text.startsWith('https://')) {
            videoUrl = text;
            try {
                const sl = await yts(text);
                if (sl?.videos?.length > 0) {
                    const v = sl.videos[0];
                    videoTitle    = v.title;
                    videoAuthor   = v.author?.name || v.author || '';
                    videoDuration = v.timestamp || '';
                    videoThumb    = getThumb(v);
                }
            } catch (_) {}
            if (!videoThumb) {
                try {
                    const id = new URL(videoUrl).searchParams.get('v');
                    if (id) videoThumb = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
                } catch (_) {}
            }
        } else {
            const { videos } = await yts(text);
            if (!videos || videos.length === 0) {
                return await sock.sendMessage(from, { text: '❌ Wimbo haujapatikana!' }, { quoted: msg });
            }
            const v = videos[0];
            videoUrl      = v.url;
            videoTitle    = v.title;
            videoAuthor   = v.author?.name || v.author || '';
            videoDuration = v.timestamp || '';
            videoThumb    = getThumb(v);
        }

        const finalTitle    = videoTitle  || 'Audio';
        const finalAuthor   = videoAuthor || 'Haijulikani';
        const finalDuration = videoDuration || '--:--';
        let downloadUrl = null;

        // Seva ya 1 — Yupra
        try {
            const res1 = await APIs.getYupraDownloadByUrl(videoUrl);
            if (res1?.download) { downloadUrl = res1.download; console.log('✅ Yupra'); }
        } catch { console.warn('⚠️ Yupra imefeli'); }

        // Seva ya 2 — Izumi
        if (!downloadUrl) {
            try {
                const res2 = await APIs.getIzumiDownloadByUrl(videoUrl);
                if (res2?.download) { downloadUrl = res2.download; console.log('✅ Izumi'); }
            } catch { console.warn('⚠️ Izumi imefeli'); }
        }

        // Seva ya 3 — Okatsu
        if (!downloadUrl) {
            try {
                const res3 = await APIs.getOkatsuDownloadByUrl(videoUrl);
                if (res3?.download) { downloadUrl = res3.download; console.log('✅ Okatsu'); }
            } catch { console.warn('⚠️ Okatsu imefeli'); }
        }

        // Seva ya 4 — EliteProTech
        if (!downloadUrl) {
            try {
                const res4 = await APIs.getEliteProTechDownloadByUrl(videoUrl);
                if (res4?.download) { downloadUrl = res4.download; console.log('✅ EliteProTech'); }
            } catch { console.error('❌ Seva zote zimegoma'); }
        }

        if (!downloadUrl) {
            return await sock.sendMessage(from, {
                text: '❌ Imeshindwa kupakua wimbo huu. Seva zote za audio ziko chini.'
            }, { quoted: msg });
        }

        // ✅ Download buffer
        await sock.sendMessage(from, { text: '📥 *Inapakua audio...*' }, { quoted: msg });

        let audioBuffer;
        try {
            const audioRes = await axios.get(downloadUrl, {
                responseType: 'arraybuffer',
                timeout: 120000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            audioBuffer = Buffer.from(audioRes.data);
        } catch (dlErr) {
            console.error('❌ Buffer download imefeli:', dlErr.message);
            return await sock.sendMessage(from, {
                text: '❌ Imeshindwa kupakua audio. Jaribu tena.'
            }, { quoted: msg });
        }

        // ✅ Tambua mimetype kwa magic bytes za buffer
        // MP3: FF FB, FF F3, FF F2, ID3
        // MP4/AAC: ftyp
        // OGG: OggS
        const sig = audioBuffer.slice(0, 12);
        let mimetype = 'audio/mpeg'; // default MP3

        if (sig[0] === 0xFF && (sig[1] === 0xFB || sig[1] === 0xF3 || sig[1] === 0xF2)) {
            mimetype = 'audio/mpeg';
        } else if (sig[0] === 0x49 && sig[1] === 0x44 && sig[2] === 0x33) {
            mimetype = 'audio/mpeg'; // ID3 tag = MP3
        } else if (sig.slice(4, 8).toString('ascii') === 'ftyp') {
            mimetype = 'audio/mp4'; // MP4/M4A/AAC
        } else if (sig.slice(0, 4).toString('ascii') === 'OggS') {
            mimetype = 'audio/ogg; codecs=opus';
        } else {
            // Angalia Content-Type kutoka header ya download
            mimetype = 'audio/mpeg'; // safe default kwa YouTube MP3
        }

        console.log(`🎵 Mimetype detected: ${mimetype} | Size: ${(audioBuffer.length/1024/1024).toFixed(2)}MB`);

        // ✅ Thumbnail kwanza
        if (videoThumb && videoThumb.startsWith('http')) {
            try {
                await sock.sendMessage(from, {
                    image: { url: videoThumb },
                    caption: `🎵 *${finalTitle}*\n👤 *Msanii:* ${finalAuthor}\n⏱️ *Muda:* ${finalDuration}\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
                }, { quoted: msg });
            } catch (_) {}
        }

        // ✅ Tuma audio — jaribu kama audio message kwanza
        // Kama imeshindwa, tuma kama document (daima inafanya kazi)
        try {
            await sock.sendMessage(from, {
                audio:    audioBuffer,
                mimetype: mimetype,
                ptt:      false,
            }, { quoted: msg });
        } catch (audioErr) {
            console.warn('⚠️ Audio message imeshindwa, natuma kama document:', audioErr.message);
            // Fallback: tuma kama document — daima inafanya kazi
            const safeFileName = finalTitle.replace(/[^\w\s-]/g, '').trim() || 'audio';
            await sock.sendMessage(from, {
                document: audioBuffer,
                mimetype: 'audio/mpeg',
                fileName: `${safeFileName}.mp3`,
                caption:  `🎵 *${finalTitle}* — ${finalAuthor}`,
            }, { quoted: msg });
        }

    } catch (error) {
        console.error('Song fatal error:', error);
        await sock.sendMessage(from, { text: `❌ Hitilafu ya mfumo: ${error.message}` }, { quoted: msg });
    }
}
