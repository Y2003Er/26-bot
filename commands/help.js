/**
 * commands/help.js
 * Orodha ya commands zote — 26-𝐓𝐄𝐂𝐇
 * Styles za textmaker zinajipanga kama commands nyingine (│ ➜ prefix + stylename)
 * ✅ FIXED: Dynamic prefix — siyo hardcoded '.'
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { prefix as configuredPrefix } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ✅ Dynamic prefix helper
const getPrefix = () => global.prefix || configuredPrefix || '.';

export const name        = 'help';
export const description = 'Orodha ya commands zote';
export const category    = 'general';
export const use         = '[command]';
export const alias       = ['menu', 'commands'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
  const from    = msg.key.remoteJid;
  const pfx     = getPrefix();
  const allCmds = global.allCommands || new Map();

  const sender     = msg.key.participant || msg.key.remoteJid || '';
  const userNumber = sender?.includes('@') ? sender.split('@')[0] : 'Mtumiaji';

  // ── 1. Kama ametoa jina la command maalum ──
  if (args[0]?.trim()) {
    // ✅ FIXED: Tumia dynamic prefix regex badala ya hardcoded /^\./
    const escapedPfx = pfx.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prefixRegex = new RegExp(`^${escapedPfx}`, 'i');
    const target = args[0].toLowerCase().trim().replace(prefixRegex, '');
    const cmd    = allCmds.get(target);

    if (!cmd) {
      return sock.sendMessage(from, {
        text: `❓ Command *${pfx}${target}* haipatikani.\nTumia *${pfx}help* kuona commands zote.`
      }, { quoted: msg });
    }

    const cmdInfo = cmd.info || cmd.description || 'Hakuna maelezo';
    const cmdType = cmd.type || cmd.category || 'general';

    let info  = `╔══════════════════════╗\n`;
    info     += `║  📋 *COMMAND INFO* ║\n`;
    info     += `╚══════════════════════╝\n\n`;
    info     += `🔹 *Jina:* ${pfx}${cmd.name}\n`;
    info     += `📝 *Maelezo:* ${cmdInfo}\n`;
    info     += `📂 *Category:* ${cmdType.toLowerCase()}\n`;
    if (cmd.use)           info += `🔧 *Matumizi:* ${pfx}${cmd.name} ${cmd.use}\n`;
    if (cmd.alias?.length) info += `🔀 *Alias:* ${cmd.alias.map(a => pfx + a).join(', ')}\n`;

    return sock.sendMessage(from, { text: info }, { quoted: msg });
  }

  // ── 2. Gawanya commands kwa category ──
  const grouped = {};
  for (const [, cmd] of allCmds.entries()) {
    if (!cmd?.name || cmd.name === 'help' || cmd.name === 'menu') continue;

    const cat = (cmd.type || cmd.category || 'general').toLowerCase();
    if (!grouped[cat]) grouped[cat] = [];

    if (!grouped[cat].some(c => c.name === cmd.name)) {
      grouped[cat].push(cmd);
    }
  }

  // ── 3. Ongeza textmaker styles kama commands za kawaida ──
  try {
    const textmakerPath = path.join(__dirname, 'textmaker.js');
    if (fs.existsSync(textmakerPath)) {
      const mod = await import(textmakerPath);
      let styleNames = [];
      if (typeof mod.getStyles === 'function') {
        const styles = await mod.getStyles();
        styleNames = Object.keys(styles);
      } else if (Array.isArray(mod.alias) && mod.alias.length > 0) {
        styleNames = mod.alias.filter(a => a !== 'styles' && a !== 'refreshstyles');
      }
      if (!grouped['textmaker']) grouped['textmaker'] = [];
      for (const styleName of styleNames) {
        if (!grouped['textmaker'].some(c => c.name === styleName)) {
          grouped['textmaker'].push({ name: styleName, use: '<maandishi>' });
        }
      }
    }
  } catch (e) {
    console.error('[help] textmaker styles error:', e.message);
  }

  // ── 4. Jenga menu ──
  let menuText  = `╭━━『 *26-𝐓𝐄𝐂𝐇* 』━━╮\n\n`;
  menuText     += `👋 Hello @${userNumber}!\n\n`;
  menuText     += `⚡ Prefix: ${pfx}\n`;
  menuText     += `📦 Total Commands: ${allCmds.size}\n`;
  menuText     += `👑 Owner: *26-𝐓𝐄𝐂𝐇*\n`;
  menuText     += `📱 Owner Number: https://wa.me/message/SQNPGC2SNDJQN1\n\n`;

  const categoryOrder = ['general', 'group', 'whatsapp', 'admin', 'owner', 'ai', 'media', 'fun', 'utility', 'textmaker', 'anime'];
  const sortedCategories = [
    ...categoryOrder.filter(c => grouped[c]),
    ...Object.keys(grouped).filter(c => !categoryOrder.includes(c)),
  ];

  for (const cat of sortedCategories) {
    const cmds = grouped[cat];
    if (!cmds?.length) continue;

    const emoji = getCategoryEmoji(cat);
    menuText += `┏━━━━━━━━━━━━━━━━━\n`;
    menuText += `┃ ${emoji} *${cat.toUpperCase()} COMMANDS*\n`;
    menuText += `┗━━━━━━━━━━━━━━━━━\n`;

    for (const cmd of cmds) {
      const usage = cmd.use ? ` _${cmd.use}_` : '';
      menuText += `│ ➜ ${pfx}${cmd.name}${usage}\n`;
    }

    menuText += `\n`;
  }

  menuText += `╰━━━━━━━━━━━━━━━━━\n\n`;
  menuText += `💡 Type *${pfx}help <command>* for more info\n`;
  menuText += `🌟 Bot Version: 1.0.0\n`;
  menuText += `_⚡ Powered by 26-𝚃𝙴𝙲𝙷_`;

  // ── 5. Tuma picha na menu ──
  const imagePath = path.join(__dirname, '../assets/bot_image.jpg');

  if (fs.existsSync(imagePath)) {
    const imageBuffer = fs.readFileSync(imagePath);
    await sock.sendMessage(from, {
      image:    imageBuffer,
      caption:  menuText,
      mentions: [sender],
    }, { quoted: msg });
  } else {
    await sock.sendMessage(from, {
      text:     menuText,
      mentions: [sender],
    }, { quoted: msg });
  }
}

function getCategoryEmoji(category) {
  const map = {
    group:     '👥',
    whatsapp:  '💬',
    general:   '⚙️',
    media:     '🎬',
    fun:       '🎉',
    admin:     '🛡️',
    owner:     '👑',
    utility:   '🔧',
    ai:        '🤖',
    textmaker: '🖋️',
    anime:     '👾',
  };
  return map[category] || '📌';
}