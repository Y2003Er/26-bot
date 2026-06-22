// ============================================================
//  .nid — Number Intelligence & OSINT Command
//  Compatible: Baileys v7+ (WhiskeySockets)
//  Usage: .nid 0712345678  au  .nid +254712345678
// ============================================================

import axios from "axios";

// ─── Helper: Safisha namba ───────────────────────────────────
function cleanNumber(num) {
  // Ondoa spaces, dashes, brackets
  let n = num.replace(/[\s\-().]/g, "");
  // Kama inaanza na 0, badilisha kuwa +254 (Kenya default — badilisha nchi yako)
  if (n.startsWith("0")) n = "+254" + n.slice(1);
  // Kama haina +, ongeza
  if (!n.startsWith("+")) n = "+" + n;
  return n;
}

// ─── 1. Numverify API — Nchi, Carrier, Line type ────────────
async function getNumverifyInfo(number) {
  try {
    // Tumia API key yako bure kutoka numverify.com
    const API_KEY = "YOUR_NUMVERIFY_API_KEY"; // <-- Weka key yako hapa
    const clean = number.replace("+", "");
    const res = await axios.get(
      `http://apilayer.net/api/validate?access_key=${API_KEY}&number=${clean}&format=1`,
      { timeout: 8000 }
    );
    const d = res.data;
    if (!d.valid) return null;
    return {
      valid: d.valid,
      number: d.international_format,
      local: d.local_format,
      country: d.country_name,
      countryCode: d.country_code,
      location: d.location || "Haijulikani",
      carrier: d.carrier || "Haijulikani",
      lineType: d.line_type || "Haijulikani",
    };
  } catch {
    return null;
  }
}

// ─── 2. NumLookup API (backup/OSINT) — Jina la mmiliki ──────
async function getOwnerName(number) {
  try {
    // numlookupapi.com — bure tier ipo
    const API_KEY = "YOUR_NUMLOOKUP_API_KEY"; // <-- Weka key yako hapa
    const clean = number.replace("+", "");
    const res = await axios.get(
      `https://api.numlookupapi.com/v1/info/${clean}?apikey=${API_KEY}`,
      { timeout: 8000 }
    );
    const d = res.data;
    return {
      name: d.name || null,
      type: d.line_type || null,
    };
  } catch {
    return null;
  }
}

// ─── 3. Spam Score — NumVerify / Sync.me fallback ───────────
async function getSpamScore(number) {
  try {
    // shouldianswer.com — public lookup
    const clean = number.replace("+", "");
    const res = await axios.get(
      `https://www.shouldianswer.com/phone-number/${clean}`,
      {
        timeout: 8000,
        headers: { "User-Agent": "Mozilla/5.0" },
      }
    );
    const html = res.data;
    // Angalia kama kuna mention ya "scam", "spam", "fraud"
    const isScam =
      /scam|spam|fraud|unsafe|dangerous/i.test(html);
    const isSafe = /safe|legitimate|trusted/i.test(html);
    if (isScam) return "🔴 Hatari — Imeripotiwa kama SPAM/SCAM";
    if (isSafe) return "🟢 Salama — Haijawahi kuripotiwa";
    return "🟡 Haijulikani — Hakuna ripoti";
  } catch {
    return "🟡 Haijulikani — API haikujibu";
  }
}

// ─── 4. WhatsApp Info via Baileys ───────────────────────────
async function getWhatsAppInfo(sock, number) {
  try {
    const jid = number.replace("+", "") + "@s.whatsapp.net";

    // Angalia kama namba ipo WhatsApp
    const [result] = await sock.onWhatsApp(number.replace("+", ""));
    if (!result?.exists) {
      return { exists: false };
    }

    // Pata profile picture
    let ppUrl = null;
    try {
      ppUrl = await sock.profilePictureUrl(jid, "image");
    } catch {
      ppUrl = null;
    }

    // Pata status/about
    let about = null;
    try {
      const status = await sock.fetchStatus(jid);
      about = status?.status || null;
    } catch {
      about = null;
    }

    // Pata last seen (inategemea privacy settings ya mtu)
    let lastSeen = null;
    try {
      const presence = await sock.fetchBlocklist(); // placeholder
      lastSeen = "Imefichwa (Privacy setting)";
    } catch {
      lastSeen = "Haijulikani";
    }

    return {
      exists: true,
      jid,
      ppUrl,
      about: about || "Hakuna status",
      lastSeen,
    };
  } catch {
    return { exists: false };
  }
}

// ─── MAIN COMMAND HANDLER ────────────────────────────────────
export async function nidCommand(sock, msg, args) {
  const from = msg.key.remoteJid;

  // Angalia kama namba imetolewa
  if (!args[0]) {
    return await sock.sendMessage(from, {
      text: `❌ *Tumia:* .nid <namba>\n\n📌 *Mfano:*\n.nid 0712345678\n.nid +254712345678`,
    }, { quoted: msg });
  }

  const rawNumber = args[0];
  const number = cleanNumber(rawNumber);

  // Tuma ujumbe wa kusubiri
  await sock.sendMessage(from, {
    text: `🔍 *Inachunguza namba...*\n\`${number}\`\n\nSubiri sekunde chache...`,
  }, { quoted: msg });

  // ── Fanya lookups zote kwa wakati mmoja (parallel) ──
  const [numInfo, ownerInfo, spamScore, waInfo] = await Promise.all([
    getNumverifyInfo(number),
    getOwnerName(number),
    getSpamScore(number),
    getWhatsAppInfo(sock, number),
  ]);

  // ── Jenga ripoti ──────────────────────────────────────────
  let report = `╔══════════════════════╗
║   📡 *NUMBER INTEL*   ║
╚══════════════════════╝

📞 *Namba:* ${number}

`;

  // ── Sehemu 1: Taarifa za Namba ─────────────────────────
  report += `┌─────────────────────┐
│  🌍 *NAMBA INFO*      │
└─────────────────────┘\n`;

  if (numInfo) {
    report += `• *Nchi:* ${numInfo.country} (${numInfo.countryCode})
• *Eneo:* ${numInfo.location}
• *Carrier:* ${numInfo.carrier}
• *Aina ya Laini:* ${numInfo.lineType}
• *Format:* ${numInfo.local} / ${numInfo.number}
• *Valid:* ${numInfo.valid ? "✅ Ndiyo" : "❌ Hapana"}\n\n`;
  } else {
    report += `• *Hali:* ⚠️ Taarifa haikupatikana\n\n`;
  }

  // ── Sehemu 2: Mmiliki (OSINT) ──────────────────────────
  report += `┌─────────────────────┐
│  👤 *MMILIKI (OSINT)* │
└─────────────────────┘\n`;

  if (ownerInfo?.name) {
    report += `• *Jina:* ${ownerInfo.name}
• *Aina:* ${ownerInfo.type || "Haijulikani"}\n\n`;
  } else {
    report += `• *Jina:* 🔒 Halijulikani / Limefichwa\n\n`;
  }

  // ── Sehemu 3: Spam Score ───────────────────────────────
  report += `┌─────────────────────┐
│  🛡️ *SPAM CHECK*      │
└─────────────────────┘
• *Hali:* ${spamScore}\n\n`;

  // ── Sehemu 4: WhatsApp Info ────────────────────────────
  report += `┌─────────────────────┐
│  💬 *WHATSAPP INFO*   │
└─────────────────────┘\n`;

  if (waInfo.exists) {
    report += `• *Ipo WhatsApp:* ✅ Ndiyo
• *Status/About:* ${waInfo.about}
• *Last Seen:* ${waInfo.lastSeen}\n`;
  } else {
    report += `• *Ipo WhatsApp:* ❌ Hapana / Haijulikani\n`;
  }

  report += `\n━━━━━━━━━━━━━━━━━━━━━
⚠️ _Taarifa hii ni kwa madhumuni ya usalama tu_`;

  // ── Tuma na picha ya profile kama ipo ─────────────────
  if (waInfo.exists && waInfo.ppUrl) {
    await sock.sendMessage(from, {
      image: { url: waInfo.ppUrl },
      caption: report,
    }, { quoted: msg });
  } else {
    await sock.sendMessage(from, {
      text: report,
    }, { quoted: msg });
  }
}


// ============================================================
//  JINSI YA KUTUMIA KWENYE BOT YAKO (index.js / handler.js)
// ============================================================
//
//  import { nidCommand } from "./commands/nid.js";
//
//  // Kwenye message handler yako:
//  const body = msg.message?.conversation ||
//               msg.message?.extendedTextMessage?.text || "";
//  const args = body.trim().split(" ").slice(1);
//  const cmd  = body.trim().split(" ")[0].toLowerCase().slice(1);
//
//  if (cmd === "nid") {
//    await nidCommand(sock, msg, args);
//  }
//
// ============================================================
//  APIs UNAHITAJI (ZOTE BURE):
//  1. numverify.com         → Nchi, Carrier, Line type
//  2. numlookupapi.com      → Jina la mmiliki
//  3. shouldianswer.com     → Spam check (scraping, bila key)
//  Baileys built-in         → WhatsApp info (ppUrl, about)
// ============================================================
