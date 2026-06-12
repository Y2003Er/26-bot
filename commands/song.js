import exec from 'yt-dlp-exec';
import yts from 'yt-search';
import fs from 'fs';
import os from 'os';
import path from 'path';

const playCommand = {
    name: 'play',
    alias: ['song', 'wimbo'],
    description: 'Tafuta na upakue wimbo kutoka YouTube (Audio kupitia yt-dlp)',
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

        try {
            await sock.sendMessage(msg.key.remoteJid, {
                react: { text: '⏳', key: msg.key }
            });
        } catch (e) {
            console.error('Failed to react:', e.message);
        }

        const tmpDir = os.tmpdir();
        const outputFilename = `${Date.now()}_audio`;
        let audioPath = null;

        try {
            // Search for the song
            let search = await yts(`${text} Song`);
            if (!search.videos.length) {
                return await sock.sendMessage(msg.key.remoteJid, {
                    text: '❌ Wimbo haujapatikana, jaribu jina jengine.'
                }, { quoted: msg });
            }

            const vid = search.videos[0];
            const { title, thumbnail, timestamp, views, ago, url } = vid;

            // Send thumbnail + info first
            const captvid = `✼ ••๑⋯ ❀ Y O U T U B E ❀ ⋯⋅๑•• ✼
❏ Title: ${title}
❐ Duration: ${timestamp}
❑ Views: ${views}
❒ Uploaded: ${ago}
❒ Link: ${url}
⊱─━━━━⊱༻●༺⊰━━━━─⊰`;

            await sock.sendMessage(msg.key.remoteJid, {
                image: { url: thumbnail },
                caption: captvid
            }, { quoted: msg });

            // Run yt-dlp download
            await exec(url, {
                geoBypass: true,
                extractorArgs: 'youtube:player_client=android,web',
                userAgent: 'Mozilla/5.0 (Linux; Android 12; SM-G991B)',
                noCheckCertificate: true,
                noCacheDir: true,
                extractAudio: true,
                audioFormat: 'mp3',
                audioQuality: '128K',
                output: path.join(tmpDir, `${outputFilename}.%(ext)s`)
            });

            // ✅ Detect actual output file (yt-dlp may use .mp3, .m4a, .webm, etc.)
            const files = fs.readdirSync(tmpDir);
            const audioFile = files.find(f => f.startsWith(outputFilename));

            if (!audioFile) {
                throw new Error('yt-dlp completed but no output file was found in tmpDir');
            }

            audioPath = path.join(tmpDir, audioFile);
            console.log(`✅ Audio file found: ${audioPath}`);

            // Read file into buffer (more reliable than passing URL path to Baileys)
            const audioBuffer = fs.readFileSync(audioPath);

            // Send audio message
            await sock.sendMessage(msg.key.remoteJid, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                ptt: false,
                fileName: `${title}.mp3`,
                contextInfo: {
                    externalAdReply: {
                        showAdAttribution: true,
                        mediaType: 2,
                        mediaUrl: url,
                        title: title,
                        body: 'HERE IS YOUR SONG 🎧',
                        sourceUrl: url,
                        thumbnailUrl: thumbnail,
                    },
                },
            }, { quoted: msg });

            // Done reaction
            await sock.sendMessage(msg.key.remoteJid, {
                react: { text: '✅', key: msg.key }
            });

        } catch (error) {
            console.error('Play command error:', error);
            await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Hitilafu imetokea wakati wa kupakua wimbo huo. Tafadhali jaribu tena.'
            }, { quoted: msg });

            // Error reaction
            try {
                await sock.sendMessage(msg.key.remoteJid, {
                    react: { text: '❌', key: msg.key }
                });
            } catch (_) {}

        } finally {
            // ✅ Always cleanup temp file regardless of success or failure
            if (audioPath && fs.existsSync(audioPath)) {
                try {
                    await fs.promises.unlink(audioPath);
                    console.log(`🗑️ Deleted temp file: ${audioPath}`);
                } catch (e) {
                    console.error('Failed to delete temp file:', e.message);
                }
            }
        }
    }
};

export default playCommand;