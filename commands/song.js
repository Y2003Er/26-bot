/**
 * commands/song.js
 * Download wimbo (Audio MP3) kutoka YouTube — Toleo la Kasi na Uhakika la 26-TECH
 */

import yts from 'yt-search';
import ytdl from '@distube/ytdl-core';
import fs from 'fs';
import path from 'path';

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

        // Kikomo cha urefu kulinda RAM ya Railway
        if (finalDuration.split(':').length > 2) {
            return await sock.sendMessage(from, { 
                text: '❌ Wimbo mrefu sana. Tafadhali weka wimbo chini ya dakika 12.' 
            }, { quoted: msg });
        }
        
        const mins = parseInt(finalDuration.split(':')[0]);
        if (mins > 12) {
            return await sock.sendMessage(from, { 
                text: '❌ Wimbo unazidi dakika 12. Tafadhali omba wimbo mfupi.' 
            }, { quoted: msg });
        }

        // Tuma Thumbnail
        if (videoThumb && videoThumb.startsWith('http')) {
            try {
                await sock.sendMessage(from, {
                    image: { url: videoThumb },
                    caption: `🎵 *${finalTitle}*\n👤 *Msanii:* ${finalAuthor}\n⏱️ *Muda:* ${finalDuration}\n\n📥 *Napakua kutoka YouTube (Secured Pass) na kuileta...*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
                }, { quoted: msg });
            } catch (_) {}
        }

        const safeFileName = finalTitle.replace(/[^\w\s-]/g, '').trim() || 'audio';

        // Pakia na kusoma Cookies za YouTube zilizowekwa
        let ytdlOptions = {
            filter: 'audioonly',
            quality: 'highestaudio',
            highWaterMark: 1 << 25
        };

        try {
            const cookiesPath = path.resolve('./cookies.json');
            if (fs.existsSync(cookiesPath)) {
                const cookiesData = JSON.parse(fs.readFileSync(cookiesPath, 'utf-8'));
                // ytdl-core inahitaji cookies katika muundo wa Agent
                ytdlOptions.agent = ytdl.createAgent(cookiesData);
                console.log('✅ [26-TECH] Cookies zimesomwa na kuwekwa kwenye YTDL Agent!');
            } else {
                console.warn('⚠️ [26-TECH] Faili la cookies.json halijapatikana, inajaribu bila cookies...');
            }
        } catch (cookieErr) {
            console.error('❌ Hitilafu ya kusoma cookies:', cookieErr.message);
        }

        // 3. Kupakua audio stream
        try {
            console.log(`🔄 [26-TECH] Kuanzisha Secure YTDL Stream kwa: ${videoUrl}`);
            
            const audioStream = ytdl(videoUrl, ytdlOptions);

            await sock.sendMessage(from, {
                audio: { stream: audioStream },
                mimetype: 'audio/mpeg',
                fileName: `${safeFileName}.mp3`,
                ptt: false
            }, { quoted: msg });

            console.log('✅ YTDL: Sauti imetumwa kwa mafanikio!');

        } catch (ytdlErr) {
            console.error('⚠️ Direct Stream imefeli, tunajaribu kama Document:', ytdlErr.message);
            
            try {
                const backupStream = ytdl(videoUrl, ytdlOptions);

                await sock.sendMessage(from, {
                    document: { stream: backupStream },
                    mimetype: 'audio/mpeg',
                    fileName: `${safeFileName}.mp3`,
                    caption: `🎵 *${finalTitle}* — ${finalAuthor}\n\n> *⚡ 26-TECH Secure Pass*`,
                }, { quoted: msg });
            } catch (finalErr) {
                console.error('❌ YTDL Fatal Error:', finalErr);
                await sock.sendMessage(from, { 
                    text: `❌ Imeshindwa kupakua. YouTube Error: ${finalErr.message}` 
                }, { quoted: msg });
            }
        }

    } catch (error) {
        console.error('Song fatal error:', error);
        await sock.sendMessage(from, { text: `❌ Hitilafu ya mfumo: ${error.message}` }, { quoted: msg });
    }
}
