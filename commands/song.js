import ytdl from '@distube/ytdl-core';
import yts from 'yt-search';
import fs from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';
import os from 'os';

const streamPipeline = promisify(pipeline);

let handler = async (m, { conn, command, text, usedPrefix }) => {
  if (!text) throw `Use example: ${usedPrefix}${command} anna blue bird`;
  
  // Weka emoji ya kusubiri
  await m.react('⏳'); 

  try {
    // Kutafuta wimbo kwa usalama kutumia yt-search
    let search = await yts(`${text} Song`);
    if (!search.videos.length) throw 'Song Not Found, Try Another Title';

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
    await conn.sendMessage(m.chat, { image: { url: thumbnail }, caption: captvid }, { quoted: m });

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

    // Kupata picha ya thumbnail kwa ajili ya kuweka kwenye kijanduku cha audio (Buffer)
    let thumbnailBuffer;
    try {
      let res = await conn.getFile(thumbnail);
      thumbnailBuffer = res.data;
    } catch {
      thumbnailBuffer = thumbnail; // Kama ikifeli, tumia url ya kawaida
    }

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
          thumbnail: thumbnailBuffer,
        },
      },
    };

    // Tuma wimbo kwa mtumiaji
    await conn.sendMessage(m.chat, doc, { quoted: m });

    // Futa faili la wimbo lililohifadhiwa kwa muda ili lisijaze nafasi (Storage Cleanup)
    await fs.promises.unlink(audioPath);
    console.log(`Deleted audio file: ${audioPath}`);

  } catch (error) {
    console.error(error);
    throw 'An error occurred while processing your request. Please try again.';
  }
};

handler.help = ['play'].map((v) => v + ' <query>');
handler.tags = ['downloader'];
handler.command = /^play|song$/i; // Inakubali .play au .song
handler.exp = 0;

export default handler;
