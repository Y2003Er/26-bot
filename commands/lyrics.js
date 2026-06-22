/**
 * commands/lyrics.js
 * Tafuta mashairi ya nyimbo — Toleo la 26-TECH
 * APIs: siputzx + eliteprotech + okatsu + izumi + lyrics.ovh
 */

export const name        = 'lyrics';
export const description = 'Tafuta mashairi (lyrics) ya wimbo wowote';
export const category    = 'media';
export const use         = '<jina la wimbo>';
export const alias       = ['lyric', 'lirik'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const from  = msg.key.remoteJid;
    const query = args.join(' ').trim();

    if (!query) {
        return await sock.sendMessage(from, {
            text: `❌ Tafadhali andika jina la wimbo.\nMfano: .lyrics Mbosso Pawa`
        }, { quoted: msg });
    }

    const { default: axios } = await import('axios');

    await sock.sendMessage(from, { text: '⏳ *Natafuta mashairi, subiri kidogo...*' }, { quoted: msg });

    const HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
    const TIMEOUT = 20000;

    let lyrics     = null;
    let songTitle  = query;
    let songArtist = '';
    let thumbnail  = '';

    // ══════════════════════════════════════════
    // API 1 — siputzx.my.id (inatumika kwenye project tayari)
    // ══════════════════════════════════════════
    try {
        const res = await axios.get(
            `https://api.siputzx.my.id/api/s/lirik?judul=${encodeURIComponent(query)}`,
            { timeout: TIMEOUT, headers: HEADERS }
        );
        const d = res.data;
        if (d?.status && d?.data?.lyrics) {
            lyrics     = d.data.lyrics;
            songTitle  = d.data.title  || query;
            songArtist = d.data.artist || '';
            thumbnail  = d.data.image  || d.data.thumbnail || '';
            console.log('✅ Lyrics: siputzx');
        }
    } catch { console.warn('⚠️ siputzx lyrics imefeli'); }

    // ══════════════════════════════════════════
    // API 2 — eliteprotech-apis.zone.id
    // ══════════════════════════════════════════
    if (!lyrics) {
        try {
            const res = await axios.get(
                `https://eliteprotech-apis.zone.id/lyrics?query=${encodeURIComponent(query)}`,
                { timeout: TIMEOUT, headers: HEADERS }
            );
            const d = res.data;
            if (d?.lyrics || d?.result?.lyrics) {
                const r    = d.result || d;
                lyrics     = r.lyrics;
                songTitle  = r.title  || query;
                songArtist = r.artist || '';
                thumbnail  = r.thumbnail || r.image || '';
                console.log('✅ Lyrics: eliteprotech');
            }
        } catch { console.warn('⚠️ eliteprotech lyrics imefeli'); }
    }

    // ══════════════════════════════════════════
    // API 3 — okatsu-rolezapiiz.vercel.app
    // ══════════════════════════════════════════
    if (!lyrics) {
        try {
            const res = await axios.get(
                `https://okatsu-rolezapiiz.vercel.app/lyrics?query=${encodeURIComponent(query)}`,
                { timeout: TIMEOUT, headers: HEADERS }
            );
            const d = res.data;
            if (d?.lyrics || d?.result?.lyrics) {
                const r    = d.result || d;
                lyrics     = r.lyrics;
                songTitle  = r.title  || query;
                songArtist = r.artist || '';
                thumbnail  = r.thumbnail || '';
                console.log('✅ Lyrics: okatsu');
            }
        } catch { console.warn('⚠️ okatsu lyrics imefeli'); }
    }

    // ══════════════════════════════════════════
    // API 4 — izumiiiiiiii.dpdns.org
    // ══════════════════════════════════════════
    if (!lyrics) {
        try {
            const res = await axios.get(
                `https://izumiiiiiiii.dpdns.org/lyrics?query=${encodeURIComponent(query)}`,
                { timeout: TIMEOUT, headers: HEADERS }
            );
            const d = res.data;
            if (d?.result?.lyrics || d?.lyrics) {
                const r    = d.result || d;
                lyrics     = r.lyrics;
                songTitle  = r.title  || query;
                songArtist = r.artist || '';
                thumbnail  = r.thumbnail || '';
                console.log('✅ Lyrics: izumi');
            }
        } catch { console.warn('⚠️ izumi lyrics imefeli'); }
    }

    // ══════════════════════════════════════════
    // API 5 — lyrics.ovh (gawanya query: neno kwanza=artist, mengine=title)
    // ══════════════════════════════════════════
    if (!lyrics) {
        try {
            let artist, title;
            if (query.includes(' - ')) {
                [artist, ...title] = query.split(' - ');
                title = title.join(' - ');
            } else {
                const parts = query.split(' ');
                artist = parts[0];
                title  = parts.slice(1).join(' ') || query;
            }
            const res = await axios.get(
                `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
                { timeout: TIMEOUT, headers: HEADERS }
            );
            if (res.data?.lyrics) {
                lyrics     = res.data.lyrics;
                songTitle  = title;
                songArtist = artist;
                console.log('✅ Lyrics: lyrics.ovh');
            }
        } catch { console.warn('⚠️ lyrics.ovh imefeli'); }
    }

    // ══════════════════════════════════════════
    // Hakuna API iliyofaulu
    // ══════════════════════════════════════════
    if (!lyrics) {
        return await sock.sendMessage(from, {
            text: `❌ *Mashairi hayajapatikana kwa:* _${query}_\n\n` +
                  `💡 Jaribu:\n` +
                  `• *.lyrics Mbosso - Pawa*\n` +
                  `• *.lyrics Diamond Platnumz - Jeje*\n` +
                  `• Tumia jina la Kiingereza kama lipo`
        }, { quoted: msg });
    }

    // Kata kama ndefu sana (WhatsApp limit ~65k chars lakini tunaweka 4000)
    if (lyrics.length > 4000) {
        lyrics = lyrics.substring(0, 4000) + '\n\n_(Yaliyobaki yamekatwa...)_';
    }

    const caption =
        `🎵 *${songTitle}*\n` +
        `👤 *Msanii:* ${songArtist || 'Haijulikani'}\n` +
        `━━━━━━━━━━━━━━━━\n\n` +
        `📝 *MASHAIRI:*\n\n${lyrics}\n\n` +
        `_⚡ Powered by 26-𝚃𝙴𝙲𝙷_`;

    if (thumbnail && thumbnail.startsWith('http')) {
        try {
            await sock.sendMessage(from, {
                image: { url: thumbnail }, caption
            }, { quoted: msg });
            return;
        } catch { /* thumbnail imeshindwa */ }
    }

    await sock.sendMessage(from, { text: caption }, { quoted: msg });
}
