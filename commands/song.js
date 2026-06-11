/**
 * commands/song.js
 * Download wimbo (Audio MP3) kutoka YouTube — Toleo thabiti la Local Storage la 26-TECH
 */

import yts from 'yt-search';
import ytdl from '@distube/ytdl-core';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const name        = 'song';
export const description = 'Download wimbo (MP3) kutoka YouTube kupitia Local Temp Storage';
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

    // Tengeneza variable ya njia ya faili nje ili iweze kufutika hata makosa yakitokea
    let tempFilePath = '';

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
        
        // Kutengeneza sehemu salama ya kuhifadhi faili la muda kule Railway
        tempFilePath = path.join(os.tmpdir(), `${Date.now()}_${safeFileName}.mp3`);

        // Mfumo uliorekebishwa wa YTDL Options
        let ytdlOptions = {
            filter: 'audioonly',
            quality: 'highestaudio',
            highWaterMark: 1 << 25
        };

        try {
            const cookiesPath = path.resolve('./cookies.json');
            if (fs.existsSync(cookiesPath)) {
                const cookiesData = JSON.parse(fs.readFileSync(cookiesPath, 'utf-8'));
                ytdlOptions.agent = ytdl.createAgent(cookiesData);
                console.log('✅ [26-TECH] Cookies zimepachikwa kwa ufanisi.');
            }
        } catch (cookieErr) {
            console.error('❌ Hitilafu ya cookies:', cookieErr.message);
        }

        console.log(`🔄 [26-TECH] Kuanza kupakua kwenda kwenye diski: ${tempFilePath}`);

        // Kupakua na kuandika faili kwanza kwenye seva (Pipe kwenda WriteStream)
        const downloadStream = ytdl(videoUrl, ytdlOptions);
        const fileStream = fs.createWriteStream(tempFilePath);

        await new Promise((resolve, reject) => {
            downloadStream.pipe(fileStream);
            fileStream.on('finish', resolve);
            downloadStream.on('error', reject);
            fileStream.on('error', reject);
        });

        console.log('✅ Faili limeshapakuliwa kikamilifu kwenye seva, sasa linatumwa WhatsApp...');

        // Tuma faili lililopo kwenye diski kwenda WhatsApp
        await sock.sendMessage(from, {
            audio: { url: tempFilePath }, // Inasoma faili la ndani ya seva moja kwa moja
            mimetype: 'audio/mpeg',
            fileName: `${safeFileName}.mp3`,
            ptt: false
        }, { quoted: msg });

        console.log('✅ YTDL Local: Wimbo umetumwa kwa mafanikio!');

        // Futa faili la muda mara moja ili kulinda diski ya Railway
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
            console.log('🗑️ [26-TECH] Faili la muda limefutwa vizuri.');
        }

    } catch (error) {
        console.error('Song fatal error:', error);
        await sock.sendMessage(from, { text: `❌ Imeshindwa kupakua. YouTube Error: ${error.message}` }, { quoted: msg });
        
        // Futa faili la muda likitokea kosa lolote katikati ili kuzuia memory leak
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch (_) {}
        }
    }
}
