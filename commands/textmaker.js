import mumaker from 'mumaker';
import * as cheerio from 'cheerio';
import FormData from 'form-data';
import axios from 'axios';

// ======================
// CONFIG
// ======================
const BASE_URL = 'https://textpro.me';

const CATEGORIES = [
  { slug: 'light-style-c27',        name: 'neon'      },
  { slug: 'misc-style-c29',         name: 'misc'      },
  { slug: 'deluxe-text-effect-c31', name: 'luxury'    },
  { slug: '3d-text-effect-c32',     name: '3d'        },
  { slug: 'tech-text-effect-c33',   name: 'tech'      },
  { slug: 'graffiti-style-c34',     name: 'graffiti'  },
  { slug: 'metallic-style-c28',     name: 'metallic'  },
];

// Cache ya styles iliyofetchwa
let STYLES_CACHE = {};       // { alias: { url, cat, title } }
let LAST_FETCH   = 0;
const CACHE_TTL  = 6 * 60 * 60 * 1000; // refresh kila masaa 6

// Ukomo wa usalama tu kwa maneno marefu sana yasiyo ya kawaida
const MAX_ALIAS_LEN = 15;

// Maneno yasiyo na maana — yanarukwa wakati wa kutafuta neno la kwanza
const FILLER_WORDS = new Set([
  'a', 'an', 'the', 'for', 'with', 'and', 'of', 'on', 'in', 'to',
  'create', 'make', 'generate', 'write', 'free', 'online',
]);

// ======================
// FALLBACK ENGINE — inashughulikia radio groups ZOTE (radio0, radio1, ...)
// Inatumia axios kama mumaker inavyofanya — cookies zinashughulikiwa vizuri.
// Tofauti na mumaker: tunachukua radio0, radio1, radio2... zote badala ya radio0 tu.
// ======================
async function textproFallback(url, text) {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36 Edg/115.0.1901.188';
  const origin = new URL(url).origin;

  const headers = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Origin': origin,
    'Referer': url,
    'User-Agent': UA,
  };

  // Step 1: GET — axios inashughulikia cookies vizuri (kama mumaker)
  const a = await axios.get(url, { headers });
  const $ = cheerio.load(a.data);

  // Step 2: Soma form fields — kama mumaker inavyofanya
  const server   = $('#build_server').val();
  const serverId = $('#build_server_id').val();
  const token    = $('#token').val();
  const submit   = $('#submit').val();

  // Step 3: Jenga post object — kama mumaker, lakini na radio groups ZOTE
  const post = {
    submit,
    token,
    build_server:    server,
    build_server_id: Number(serverId),
  };

  // Hapa ndipo mumaker inashindwa — inachukua radio0[radio] tu
  // Sisi: tunachukua radio0, radio1, radio2... hadi group haina options
  let i = 0;
  while (true) {
    const groupName = `radio${i}[radio]`;
    const options = [];
    $(`input[name="${groupName}"]`).each((_, el) => {
      options.push($(el).attr('value'));
    });
    if (!options.length) break;
    post[groupName] = options[Math.floor(Math.random() * options.length)];
    i++;
  }

  // Step 4: Form data + text — kama mumaker
  const form = new FormData();
  for (const key in post) form.append(key, post[key]);

  // Hesabu text inputs zinazohitajika kwenye ukurasa (Line 1, Line 2, ...)
  const requiredInputs = $('input[name="text[]"], textarea[name="text[]"]').length || 2;
  let texts = Array.isArray(text) ? text : [text];
  // Kama text zilizotolewa ni chache kuliko zinazohitajika, jaza kwa kurudia ya mwisho
  while (texts.length < requiredInputs) texts.push(texts[texts.length - 1]);
  for (const t of texts) form.append('text[]', t);

  // Step 5: POST — cookies kutoka response ya GET, kama mumaker
  const b = await axios.post(url, form, {
    headers: {
      ...headers,
      ...form.getHeaders(),
      'Cookie': a.headers['set-cookie']?.join('; ') || '',
    },
  });

  // Step 6: Pata form_value
  const $2 = cheerio.load(b.data);
  const raw = $2('#form_value').first().text()
    || $2('#form_value_input').first().text()
    || $2('#form_value').first().val()
    || $2('#form_value_input').first().val();

  if (!raw || raw === 'undefined' || raw === '') {
    throw new Error('form_value haikupatikana — textpro.me imekataa request');
  }

  // Step 7: Tengeneza picha — kama mumaker
  const c = await axios.post(`${origin}/effect/create-image`, JSON.parse(raw), {
    headers: {
      'Accept': '*/*',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Origin': origin,
      'Referer': url,
      'User-Agent': UA,
      'Cookie': a.headers['set-cookie']?.join('; ') || '',
    },
  });

  return {
    status: c.data?.success,
    image:  server + (c.data?.fullsize_image || c.data?.image || ''),
    session: c.data?.session_id,
  };
}

// ======================
// SCRAPER — tengeneza alias kutoka slug (neno kamili la kwanza la maana)
// Mfano: "road-warning-text-1234"       -> "road"
//        "rustic-effect-and-the-title"  -> "rustic"
// ======================
function slugToAlias(slug) {
  const cleaned = slug.replace(/-\d{3,4}$/, '');
  const words   = cleaned.split('-').filter(Boolean);

  let word = words.find(w => !FILLER_WORDS.has(w) && w.length > 1);
  if (!word) word = words[0] || cleaned;

  return word.toLowerCase().slice(0, MAX_ALIAS_LEN);
}

// ======================
// SCRAPER — fetch page moja
// ======================
async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 26-bot/1.0)' },
    signal: AbortSignal.timeout(10000),
  });

  // 404 inamaanisha hakuna page zaidi — rudisha null badala ya throw
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} kwa ${url}`);

  return res.text();
}

// ======================
// SCRAPER — parse styles kutoka HTML
// ======================
function parseStyles(html, catName) {
  const $ = cheerio.load(html);
  const styles = [];

  $('a[href]').each((_, el) => {
    const href  = $(el).attr('href') || '';
    const title = $(el).text().trim();

    const match = href.match(/^\/([a-z0-9-]+-(\d{3,4}))\.html$/);
    if (!match || !title || title.length < 3) return;

    const slug    = match[1];
    const fullUrl = `${BASE_URL}/${slug}.html`;
    const alias   = slugToAlias(slug);

    if (alias.length < 2) return;

    styles.push({ alias, url: fullUrl, cat: catName, title });
  });

  return styles;
}

// ======================
// SCRAPER — paginate category
// ======================
async function scrapeCategory(slug, catName) {
  const styles = [];
  let   page   = 1;

  while (true) {
    const url = page === 1
      ? `${BASE_URL}/${slug}`
      : `${BASE_URL}/${slug}-p${page}`;

    let html;
    try {
      html = await fetchPage(url);
    } catch (e) {
      console.error(`  ⚠️  fetchPage error (page ${page}): ${e.message}`);
      break;
    }

    if (!html) break;

    const found = parseStyles(html, catName);
    if (!found.length) break;

    styles.push(...found);

    const hasNext = html.includes(`-p${page + 1}`);
    if (!hasNext) break;

    page++;
    await new Promise(r => setTimeout(r, 500));
  }

  return styles;
}

// ======================
// MAIN FETCH — scrape kila category
// ======================
async function fetchAllStyles() {
  console.log('⏳ [textmaker] Inafetch styles kutoka textpro.me...');

  const newCache = {};
  const seen     = new Set();

  for (const { slug, name } of CATEGORIES) {
    try {
      const styles = await scrapeCategory(slug, name);

      for (const s of styles) {
        let resolvedAlias = s.alias;

        if (seen.has(resolvedAlias)) {
          let i = 2;
          while (seen.has(`${resolvedAlias}${i}`)) i++;
          resolvedAlias = `${resolvedAlias}${i}`;
        }

        seen.add(resolvedAlias);
        newCache[resolvedAlias] = { url: s.url, cat: s.cat, title: s.title };
      }

      console.log(`  ✅ ${name}: styles ${styles.length} zimepatikana`);
      await new Promise(r => setTimeout(r, 300));

    } catch (e) {
      console.error(`  ❌ ${name}: ${e.message}`);
    }
  }

  STYLES_CACHE = newCache;
  LAST_FETCH   = Date.now();

  const total = Object.keys(newCache).length;
  console.log(`✅ [textmaker] Styles ${total} zote zimepakiwa!`);

  return newCache;
}

// ======================
// GET STYLES — kutoka cache au fetch fresh (exported kwa help.js)
// ======================
export async function getStyles(forceRefresh = false) {
  const stale = Date.now() - LAST_FETCH > CACHE_TTL;

  if (forceRefresh || stale || !Object.keys(STYLES_CACHE).length) {
    await fetchAllStyles();
  }

  return STYLES_CACHE;
}

// ======================
// EXPORT INFO
// ======================
export const name     = 'textmaker';
export const category = 'textmaker';

export let alias = [];

export async function onLoad() {
  const styles = await getStyles();
  alias = [...Object.keys(styles), 'styles', 'refreshstyles'];
  console.log(`🎨 [textmaker] Commands ${alias.length} zimesajiliwa (pamoja na styles + refreshstyles).`);
}

// ======================
// EXECUTE
// ======================
export async function execute(sock, msg, args) {

  const jid = msg.key.remoteJid;

  const full =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text || '';

  const prefix = global.prefix || '.';

  const cmd = full.split(' ')[0]
    .replace(prefix, '')
    .toLowerCase();

  const text = args.join(' ').trim();

  // ======================
  // SPECIAL: .refreshstyles
  // ======================
  if (cmd === 'refreshstyles') {
    await sock.sendMessage(jid, {
      text: '⏳ *Inafetch styles mpya kutoka textpro.me...*'
    }, { quoted: msg });

    try {
      const styles = await getStyles(true);
      alias = Object.keys(styles);

      return sock.sendMessage(jid, {
        text: `✅ *Styles zimesasishwa!*\n📦 Jumla: *${alias.length} styles*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
      }, { quoted: msg });

    } catch {
      return sock.sendMessage(jid, {
        text: '❌ *Imeshindwa kufetch styles. Jaribu tena baadaye.*'
      }, { quoted: msg });
    }
  }

  // ======================
  // SPECIAL: .styles [category?]
  // ======================
  if (cmd === 'styles') {
    const styles   = await getStyles();
    const filterBy = text.toLowerCase();

    const grouped = {};
    for (const [key, info] of Object.entries(styles)) {
      if (filterBy && info.cat !== filterBy) continue;
      if (!grouped[info.cat]) grouped[info.cat] = [];
      grouped[info.cat].push(key);
    }

    if (!Object.keys(grouped).length) {
      return sock.sendMessage(jid, {
        text: `❌ Category *${filterBy}* haipatikani.\n\nCategories zilizopo: ${CATEGORIES.map(c => c.name).join(', ')}`
      }, { quoted: msg });
    }

    let out = `╭━━『 *TEXTMAKER STYLES* 』━━╮\n\n`;
    out    += `📦 Jumla: *${Object.keys(styles).length} styles*\n\n`;

    for (const [cat, list] of Object.entries(grouped)) {
      out += `┏━━━━━━━━━━━━━━━━━\n`;
      out += `┃ 🎨 *${cat.toUpperCase()} STYLES* (${list.length})\n`;
      out += `┗━━━━━━━━━━━━━━━━━\n`;

      for (const styleName of list) {
        out += `│ ➜ ${prefix}${styleName}\n`;
      }

      out += `\n`;
    }

    out += `╰━━━━━━━━━━━━━━━━━\n`;
    out += `> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`;

    return sock.sendMessage(jid, { text: out }, { quoted: msg });
  }

  // ======================
  // VALIDATION — text lazima iwepo
  // ======================
  if (!text) {
    return sock.sendMessage(jid, {
      text: `❌ *Matumizi:*\n.${cmd} maandishi yako\n\n💡 Kwa styles zenye mistari mingi (km. retro/banner), tumia "|":\n.${cmd} mstari1 | mstari2`
    }, { quoted: msg });
  }

  // ======================
  // TAFUTA STYLE
  // ======================
  const styles = await getStyles();
  const style  = styles[cmd];

  if (!style) {
    return sock.sendMessage(jid, {
      text: `❌ *Style haipatikani:* \`${cmd}\`\n\nTumia *.styles* kuona orodha kamili.`
    }, { quoted: msg });
  }

  // Gawanya maandishi kwa "|" kama mtumiaji ametoa mistari mingi (hauhitaji fetch yoyote ya ziada)
  const lines   = text.split('|').map(t => t.trim()).filter(Boolean);
  const payload = lines.length > 1 ? lines : text;

  // ======================
  // GENERATE IMAGE
  // ======================
  try {
    await sock.sendMessage(jid, {
      text: `⏳ *Inatengeneza picha ya "${style.title}"...*`
    }, { quoted: msg });

    let res;
    try {
      // Jaribu mumaker kwanza (haraka, inafanya kazi kwa styles nyingi)
      res = await mumaker.textpro(style.url, payload);
    } catch (muErr) {
      // Kama mumaker imeshindwa kwa sababu ya radio/JSON — tumia fallback yetu
      if (muErr.message?.includes('JSON') || muErr.message?.includes('undefined') || muErr.message?.includes('null')) {
        res = await textproFallback(style.url, payload);
      } else {
        throw muErr;
      }
    }

    if (!res?.image) throw new Error('Hakuna picha iliyorudishwa na API');

    const imgRes = await fetch(res.image, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 26-bot/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!imgRes.ok) throw new Error(`Imeshindwa kupakua picha: HTTP ${imgRes.status}`);

    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    await sock.sendMessage(jid, {
      image:   imgBuffer,
      caption: `✨ *${cmd.toUpperCase()}* · _${style.cat}_\n📝 ${text}\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
    }, { quoted: msg });

  } catch (e) {
    console.error(`❌ [textmaker] Style "${cmd}" imeshindwa | URL: ${style.url} | Error: ${e.stack || e.message}`);

    await sock.sendMessage(jid, {
      text: `❌ *Imeshindwa kutengeneza picha.*\n🔎 Style: \`${cmd}\`\n⚠️ Sababu: ${e.message}\n\nTumia *.styles* kuona orodha kamili.`
    }, { quoted: msg });
  }
}
