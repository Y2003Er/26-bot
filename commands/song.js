import yts from 'yt-search';
import ytdl from 'ytdl-core';
import fs from 'fs';
import path from 'path';

export default {
  name: 'song',
  description: 'Download song from YouTube',
  async execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    
    if (!args.length) {
      return sock.sendMessage(from, { text: 'Tafadhali andika jina la wimbo. Mfano: .song Mbosso Pawa' });
    }
    
    const query = args.join(' ');
    
    try {
      await sock.sendMessage(from, { text: `Ninatafuta ${query}...` });
      
      // Tafuta wimbo
      const search = await yts(query);
      const video = search.videos[0];
      
      if (!video) {
        return sock.sendMessage(from, { text: 'Hakuna wimbo uliopatikana.' });
      }
      
      await sock.sendMessage(from, { text: `Ninapakia: ${video.title}\nSubiri kidogo...` });
      
      // Download audio kwa kutumia ytdl-core
      const stream = ytdl(video.url, { 
        filter: 'audioonly',
        quality: 'highestaudio'
      });
      
      const filePath = `./tmp/${Date.now()}.mp3`;
      
      // Hakikisha folder ya tmp ipo
      if (!fs.existsSync('./tmp')) {
        fs.mkdirSync('./tmp');
      }
      
      const writeStream = fs.createWriteStream(filePath);
      
      await new Promise((resolve, reject) => {
        stream.pipe(writeStream);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });
      
      // Tuma audio
      await sock.sendMessage(from, {
        audio: { url: filePath },
        mimetype: 'audio/mpeg',
        fileName: `${video.title}.mp3`
      });
      
      // Futa file baada ya kutuma
      fs.unlinkSync(filePath);
      
    } catch (error) {
      console.error(error);
      await sock.sendMessage(from, { text: 'Samahani, imeshindikana kupakia wimbo. Jaribu tena.' });
    }
  }
};