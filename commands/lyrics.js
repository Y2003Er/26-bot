/**
 * commands/lyrics.js
 * Tafuta mashairi ya nyimbo — Toleo la 26-TECH
 * FIXED: vreden API imekufa — APIs 3 za backup
 */

export const name        = 'lyrics';
export const description = 'Tafuta mashairi (lyrics) ya wimbo wowote';
export const category    = 'media';
export const use         = '<msanii> - <wimbo> au <wimbo> peke yake';
export const alias       = ['lyric', 'lirik'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const from  = msg.key.remoteJid;
    const query = args.join(' ').trim();

    if (!query) {
        return await sock.sendMessage(from, {
            text: `❌ Tafadhali andika jina la wimbo.\n` +
                  `Mfano: .lyrics Diamond Platnumz Jeje\n` +
                  `Au: .lyrics Mbosso Natamani`
        }, { quoted: msg });
    }

    const { default: axios } = await import('axios');

    await sock.sendMessage(from, { text: '⏳ *Natafuta mashairi, subiri kidogo...*' }, { quoted: msg });

    // Gawanya query kuwa artist na title kama kuna " - "
    let artist = '';
    let title  = query;
    if (query.includes(' - ')) {
        const parts = query.split(' - ');
        artist = parts[0].trim();
        title  = parts.slice(1).join(' - ').trim();
    }

    const HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    let lyrics      = null;
    let songTitle   = query;
    let songArtist  = '';
    let thumbnail   = '';
    let usedSource  = '';

    // ══════════════════════════════════════════
    // API 1 — some-random-api.com (inahitaji title tu)
    // ══════════════════════════════════════════
    if (!lyrics) {
        try {
            const res = await axios.get(
                `https://some-random-api.com/lyrics?title=${encodeURIComponent(query)}`,
                { timeout: 15000, headers: HEADERS }
            );
            if (res.data?.lyrics) {
                lyrics     = res.data.lyrics;
                songTitle  = res.data.title  || query;
                songArtist = res.data.author || '';
                thumbnail  = res.data.thumbnail?.genius || '';
                usedSource = 'some-random-api';
            }
        } catch {
            console.warn('⚠️ some-random-api imefeli');
        }
    }

    // ══════════════════════════════════════════
    // API 2 — lyrics.ovh (inahitaji artist + title)
    // ══════════════════════════════════════════
    if (!lyrics && artist) {
        try {
            const res = await axios.get(
                `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
                { timeout: 15000, headers: HEADERS }
            );
            if (res.data?.lyrics) {
                lyrics     = res.data.lyrics;
                songTitle  = title;
                songArtist = artist;
                usedSource = 'lyrics.ovh';
            }
        } catch {
            console.warn('⚠️ lyrics.ovh imefeli');
        }
    }

    // ══════════════════════════════════════════
    // API 3 — lyrics.ovh mirror (kama artist hayupo, tumia query yote)
    // ══════════════════════════════════════════
    if (!lyrics && !artist) {
        try {
            // Jaribu kugawanya query — neno la kwanza = artist, mengine = title
            const words  = query.split(' ');
            const a      = words[0];
            const t      = words.slice(1).join(' ') || query;
            const res = await axios.get(
                `https://api.lyrics.ovh/v1/${encodeURIComponent(a)}/${encodeURIComponent(t)}`,
                { timeout: 15000, headers: HEADERS }
            );
            if (res.data?.lyrics) {
                lyrics     = res.data.lyrics;
                songTitle  = t;
                songArtist = a;
                usedSource = 'lyrics.ovh (auto-split)';
            }
        } catch {
            console.warn('⚠️ lyrics.ovh mirror imefeli');
        }
    }

    // ══════════════════════════════════════════
    // Hakuna API iliyofaulu
    // ══════════════════════════════════════════
    if (!lyrics) {
        return await sock.sendMessage(from, {
            text: `❌ *Mashairi hayajapatikana kwa:* _${query}_\n\n` +
                  `💡 Jaribu:\n` +
                  `• Andika vizuri: *msanii - wimbo*\n` +
                  `• Mfano: *.lyrics Diamond Platnumz - Jeje*\n` +
                  `• Tumia jina la Kiingereza kama lipo`
        }, { quoted: msg });
    }

    // Kata kama ni ndefu sana
    if (lyrics.length > 4000) {
        lyrics = lyrics.substring(0, 4000) + '\n\n_(Yaliyobaki yamekatwa kwa sababu ya urefu...)_';
    }

    console.log(`✅ Lyrics found via ${usedSource}`);

    const caption =
        `🎵 *${songTitle}*\n` +
        `👤 *Msanii:* ${songArtist || 'Haijulikani'}\n` +
        `━━━━━━━━━━━━━━━━\n\n` +
        `📝 *MASHAIRI:*\n\n${lyrics}\n\n` +
        `_⚡ Powered by 26-𝚃𝙴𝙲𝙷_`;

    if (thumbnail && thumbnail.startsWith('http')) {
        try {
            await sock.sendMessage(from, {
                image:   { url: thumbnail },
                caption: caption
            }, { quoted: msg });
            return;
        } catch { /* thumbnail imeshindwa — tuma text */ }
    }

    await sock.sendMessage(from, { text: caption }, { quoted: msg });
}
