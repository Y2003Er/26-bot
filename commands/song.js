import ytdl from '@distube/ytdl-core';
import yts from 'yt-search';
import fs from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';
import os from 'os';

const streamPipeline = promisify(pipeline);

const playCommand = {
    name: 'play',
    alias: ['song', 'wimbo'],
    description: 'Tafuta na upakue wimbo kutoka YouTube (Audio)',
    category: 'downloader',
    use: '<jina la wimbo>',
    ownerOnly: false,
    adminOnly: false,
    execute: async (sock, msg, args) => {
        // Kuunganisha args kuwa text moja ya kutafutia wimbo
        const text = args.join(' ');
        
        if (!text) {
            return await sock.sendMessage(msg.key.remoteJid, { 
                text: `❌ Tafadhali weka jina la wimbo.\n\nMfano: .play anna blue bird` 
            }, { quoted: msg });
        }

        // Kuitikia ujumbe kwa kuweka emoji ya kusubiri (Reaction)
        try {
            await sock.sendMessage(msg.key.remoteJid, {
                react: { text: '⏳', key: msg.key }
            });
        } catch (e) {
            console.error('Failed to react:', e.message);
        }

        try {
            // Kutafuta wimbo kwa usalama kutumia yt-search
            let search = await yts(`${text} Song`);
            if (!search.videos.length) {
                return await sock.sendMessage(msg.key.remoteJid, { 
                    text: '❌ Wimbo haujapatikana, jaribu jina jengine.' 
                }, { quoted: msg });
            }

            // Kuchukua wimbo wa kwanza uliopatikana
            let vid = search.videos[0];
            const { title, thumbnail, timestamp, views, ago, url } = vid;

            // Maandalizi ya ujumbe wa maelezo ya wimbo (Caption)
            const captvid = `✼ ••๑⋯ ❀ Y O U T U B E ❀ ⋯⋅๑•• ✼
❏ Title: ${title}
❐ Duration: ${timestamp}
❑ Views: ${views}
❒ Uploaded: ${ago}
❒ Link: ${url}
⊱─━━━━⊱༻●༺⊰━━━━─⊰`;

            // Tuma picha ya kava (thumbnail) ikiwa na maelezo ya wimbo
            await sock.sendMessage(msg.key.remoteJid, { 
                image: { url: thumbnail }, 
                caption: captvid 
            }, { quoted: msg });

            // Kuanza kutengeneza stream ya audio kutoka YouTube
            const audioStream = ytdl(url, {
                filter: 'audioonly',
                quality: 'highestaudio',
            });

            // Kutengeneza faili la muda (temporary file) kwenye mfumo wa seva
            const tmpDir = os.tmpdir();
            const audioPath = `${tmpDir}/${Date.now()}_audio.mp3`; 
            const writableStream = fs.createWriteStream(audioPath);

            // Pakua na uhifadhi audio kwenye folder la muda
            await streamPipeline(audioStream, writableStream);

            // Muundo wa ujumbe wa audio wenye muonekano wa kijanja (External Ad Reply)
            const doc = {
                audio: {
                    url: audioPath,
                },
                mimetype: 'audio/mpeg',
                ptt: false,
                waveform: [100, 0, 100, 0, 100, 0, 100], // Mstari wa mawimbi ya sauti
                fileName: `${title}.mp3`,
                contextInfo: {
                    externalAdReply: {
                        showAdAttribution: true,
                        mediaType: 2,
                        mediaUrl: url,
                        title: title,
                        body: 'HERE IS YOUR SONG 🎧',
                        sourceUrl: url,
                        // Kwenye Baileys mpya unaweza kupitisha URL moja kwa moja kwenye thumbnail ya ad reply
                        thumbnailUrl: thumbnail, 
                    },
                },
            };

            // Tuma wimbo kwa mtumiaji
            await sock.sendMessage(msg.key.remoteJid, doc, { quoted: msg });

            // Futa faili la wimbo lililohifadhiwa kwa muda ili lisijaze nafasi (Storage Cleanup)
            await fs.promises.unlink(audioPath);
            console.log(`Deleted audio file: ${audioPath}`);

            // Badilisha reaction kuwa tiki kuashiria umemaliza
            await sock.sendMessage(msg.key.remoteJid, {
                react: { text: '✅', key: msg.key }
            });

        } catch (error) {
            console.error('Play command error:', error);
            await sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Hitilafu imetokea wakati wa kupakua wimbo huo. Tafadhali jaribu tena.' 
            }, { quoted: msg });
        }
    }
};

export default playCommand;
