import exec from 'yt-dlp-exec';
import yts from 'yt-search';
import ytM from 'node-youtube-music';
import NodeID3 from 'node-id3';
import axios from 'axios';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { crypto } from 'crypto';

// Kazi ya kupakua picha ya kava na kuifanya kuwa Buffer kwa ajili ya ID3 Tags
async function fetchBuffer(url) {
    try {
        const res = await axios.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(res.data);
    } catch {
        return null;
    }
}

// Kazi ya kuandika Metadata (Tags) kwenye faili la MP3
async function writeTags(filePath, metadata) {
    try {
        const imageBuffer = await fetchBuffer(metadata.image);
        const tags = {
            title: metadata.title,
            artist: metadata.artist,
            album: metadata.album || 'YouTube Music',
            year: metadata.year || new Date().getFullYear().toString(),
        };

        if (imageBuffer) {
            tags.image = {
                mime: 'image/jpeg',
                type: { id: 3, name: 'front cover' },
                description: `Cover of ${metadata.title}`,
                imageBuffer: imageBuffer
            };
        }
        NodeID3.write(tags, filePath);
    } catch (e) {
        console.error('Failed to write ID3 tags:', e.message);
    }
}

const playCommand = {
    name: 'play',
    alias: ['song', 'wimbo'],
    description: 'Tafuta kwenye YT Music, weka kava (ID3 Tags) na upakue kupitia yt-dlp',
    category: 'downloader',
    use: '<jina la wimbo>',
    ownerOnly: false,
    adminOnly: false,
    execute: async (sock, msg, args) => {
        const text = args.join(' ');
        
        if (!text) {
            return await sock.sendMessage(msg.key.remoteJid, { 
                text: `❌ Tafadhali weka jina la wimbo.\n\nMfano: .play anna blue bird` 
            }, { quoted: msg });
        }

        // React kwa emoji ya kusubiri
        try {
            await sock.sendMessage(msg.key.remoteJid, { react: { text: '⏳', key: msg.key } });
        } catch {}

        try {
            let searchResult;
            let title, url, artist, album, image, year;

            // 1. Jaribu kutafuta kwenye YouTube Music kwanza kwa usahihi wa Audio
            try {
                let ytMusic = await ytM.searchMusics(text);
                if (ytMusic && ytMusic.length > 0) {
                    let track = ytMusic[0];
                    title = track.title;
                    artist = track.artists.map(x => x.name).join(', ');
                    album = track.album;
                    url = `https://www.youtube.com/watch?v=${track.youtubeId}`;
                    image = track.thumbnailUrl ? track.thumbnailUrl.replace('w120-h120', 'w600-h600') : null;
                    year = new Date().getFullYear().toString();
                }
            } catch (e) {
                console.log('YT Music search failed, falling back to standard yt-search...');
            }

            // 2. Kama YT Music isipopata, tumia yt-search ya kawaida
            if (!url) {
                let standardSearch = await yts(`${text} Song`);
                if (!standardSearch.videos.length) {
                    return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Wimbo haujapatikana!' }, { quoted: msg });
                }
                let vid = standardSearch.videos[0];
                title = vid.title;
                artist = vid.author.name;
                album = 'YouTube Release';
                url = vid.url;
                image = vid.thumbnail;
                year = vid.ago ? vid.ago.split(' ').pop() : new Date().getFullYear().toString();
            }

            // Tuma maelezo ya ujumbe (Caption)
            const captvid = `✼ ••๑⋯ ❀ Y O U T U B E ❀ ⋯⋅๑•• ✼
❏ Title: ${title}
❐ Artist: ${artist}
❑ Album: ${album}
❒ Link: ${url}
⊱─━━━━⊱༻●༺⊰━━━━─⊰`;

            await sock.sendMessage(msg.key.remoteJid, { image: { url: image }, caption: captvid }, { quoted: msg });

            // Kutengeneza njia ya faili la muda
            const tmpDir = os.tmpdir();
            const outputFilename = `${Date.now()}_audio`;
            const audioPath = path.join(tmpDir, `${outputFilename}.mp3`);

            // 3. Kupakua kwa kutumia yt-dlp yenye vigezo vyako thabiti
            await exec(url, {
                geoBypass: true,
                extractorArgs: 'youtube:player_client=android,web',
                userAgent: 'Mozilla/5.0 (Linux; Android 12; SM-G991B)',
                noCheckCertificate: true,
                noCacheDir: true,
                extractAudio: true,
                audioFormat: 'mp3',
                output: path.join(tmpDir, `${outputFilename}.%(ext)s`)
            });

            // 4. Kuandika ID3 Tags (Kuweka picha ya kava na jina la msanii ndani ya faili)
            if (fs.existsSync(audioPath)) {
                await writeTags(audioPath, { title, artist, album, image, year });
            }

            // Muundo wa ujumbe wa audio wa WhatsApp
            const doc = {
                audio: { url: audioPath },
                mimetype: 'audio/mpeg',
                ptt: false,
                waveform: [100, 0, 100, 0, 100, 0, 100], 
                fileName: `${title}.mp3`,
                contextInfo: {
                    externalAdReply: {
                        showAdAttribution: true,
                        mediaType: 2,
                        mediaUrl: url,
                        title: title,
                        body: `by ${artist} 🎧`,
                        sourceUrl: url,
                        thumbnailUrl: image, 
                    },
                },
            };

            // Tuma wimbo uliokamilika wenye kava ndani yake
            await sock.sendMessage(msg.key.remoteJid, doc, { quoted: msg });

            // Futa faili la muda kujilinda na disk space full
            if (fs.existsSync(audioPath)) {
                await fs.promises.unlink(audioPath);
            }

            // React kwa emoji ya kumaliza
            await sock.sendMessage(msg.key.remoteJid, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('Play advanced command error:', error);
            await sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Hitilafu imetokea wakati wa kuandaa wimbo wako kwa sasa.' 
            }, { quoted: msg });
        }
    }
};

export default playCommand;
