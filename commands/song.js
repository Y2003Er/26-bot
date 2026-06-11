/**
 * commands/song.js
 * Download wimbo (Audio MP3) kutoka YouTube — Toleo la Kasi na Uhakika la 26-TECH
 */

import yts from 'yt-search';
import ytdl from '@distube/ytdl-core';

export const name        = 'song';
export const description = 'Download wimbo (MP3) kutoka YouTube kupitia YTDL';
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

    try {
        await sock.sendMessage(from, { text: '⏳ *Natafuta na kuandaa wimbo wako, subiri kidogo...*' }, { quoted: msg });

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
            return '';
        };

        // 1. Tafuta Video kwenye YouTube
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

        // Kinga ya RAM Railway: Zuia nyimbo ndefu sana (Mix za masaa)
        // Kama wimbo una masaa (ina viunganishi viwili vya :)
        if (finalDuration.split(':').length > 2) {
            return await sock.sendMessage(from, { 
                text: '❌ Wimbo huu ni mrefu sana (unazidi saa 1). Tafadhali weka wimbo wa kawaida chini ya dakika 12 kulinda seva.' 
            }, { quoted: msg });
        }
        
        // Kama ni dakika lakini zinazidi dakika 12
        const mins = parseInt(finalDuration.split('[0]'));
        if (mins > 12) {
            return await sock.sendMessage(from, { 
                text: '❌ Wimbo ni mrefu sana (unazidi dakika 12). Tafadhali omba wimbo mfupi.' 
            }, { quoted: msg });
        }

        // 2. Tuma kwanza taarifa za Wimbo na Thumbnail
        if (videoThumb && videoThumb.startsWith('http')) {
            try {
                await sock.sendMessage(from, {
                    image: { url: videoThumb },
                    caption: `🎵 *${finalTitle}*\n👤 *Msanii:* ${finalAuthor}\n⏱️ *Muda:* ${finalDuration}\n\n📥 *Napakua kutoka YouTube na kuileta sasa hivi...*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
                }, { quoted: msg });
            } catch (_) {}
        }

        const safeFileName = finalTitle.replace(/[^\w\s-]/g, '').trim() || 'audio';

        // 3. Kupakua audio kwa kutumia YTDL-Core (Streaming Direct kutoka YT)
        try {
            console.log(`🔄 [26-TECH] Kuanzisha YTDL Stream kwa: ${videoUrl}`);
            
            const audioStream = ytdl(videoUrl, {
                filter: 'audioonly',
                quality: 'highestaudio',
                highWaterMark: 1 << 25 // 32MB buffer kulinda RAM ya Railway isi-crash
            });

            // Tuma kama Audio inayoplay moja kwa moja WhatsApp
            await sock.sendMessage(from, {
                audio: { stream: audioStream },
                mimetype: 'audio/mpeg',
                fileName: `${safeFileName}.mp3`,
                ptt: false
            }, { quoted: msg });

            console.log('✅ YTDL: Audio imepakulewa na imetumwa kwa mafanikio!');

        } catch (ytdlErr) {
            console.error('⚠️ YTDL Direct Stream imefeli, tunajaribu njia ya Document:', ytdlErr.message);
            
            // Fallback ya mwisho kabisa kama njia ya audio stream ikisumbua
            try {
                const backupStream = ytdl(videoUrl, {
                    filter: 'audioonly',
                    quality: 'highestaudio',
                    highWaterMark: 1 << 25
                });

                await sock.sendMessage(from, {
                    document: { stream: backupStream },
                    mimetype: 'audio/mpeg',
                    fileName: `${safeFileName}.mp3`,
                    caption: `🎵 *${finalTitle}* — ${finalAuthor}\n\n> *⚡ 26-TECH YTDL-Document*`,
                }, { quoted: msg });
            } catch (finalErr) {
                console.error('❌ YTDL Fatal Error:', finalErr);
                await sock.sendMessage(from, { 
                    text: '❌ Imeshindwa kabisa kupakua wimbo huu kutoka YouTube kwa sasa. Jaribu tena baada ya muda kidogo.' 
                }, { quoted: msg });
            }
        }

    } catch (error) {
        console.error('Song fatal error:', error);
        await sock.sendMessage(from, { text: `❌ Hitilafu ya mfumo: ${error.message}` }, { quoted: msg });
    }
}
