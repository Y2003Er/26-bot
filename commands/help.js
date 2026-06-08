/**
 * commands/help.js
 * Orodha ya commands zote — imegroupiwa kwa category
 */

export const name        = 'help';
export const description = 'Orodha ya commands zote';
export const category    = 'general';
export const use         = '[command]';
export const alias       = ['menu', 'commands'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const from   = msg.key.remoteJid;
    const pfx    = global.prefix || '.';
    const allCmds = global.allCommands || new Map();

    // ── Kama ametoa jina la command — toa maelezo yake peke yake ──
    if (args[0] && args[0].trim()) {
        const target = args[0].toLowerCase().trim().replace(/^\./, '');
        const cmd    = allCmds.get(target);

        if (!cmd) {
            return sock.sendMessage(from, {
                text: `❓ Command *${pfx}${target}* haipatikani.\nTumia *${pfx}help* kuona commands zote.`
            }, { quoted: msg });
        }

        let info  = `╔══════════════════════╗\n`;
        info     += `║  📋 *COMMAND INFO*    ║\n`;
        info     += `╚══════════════════════╝\n\n`;
        info     += `🔹 *Jina:* ${pfx}${cmd.name}\n`;
        info     += `📝 *Maelezo:* ${cmd.info || 'Hakuna maelezo'}\n`;
        info     += `📂 *Category:* ${cmd.type || 'general'}\n`;
        if (cmd.use)   info += `🔧 *Matumizi:* ${pfx}${cmd.name} ${cmd.use}\n`;
        if (cmd.alias?.length) info += `🔀 *Alias:* ${cmd.alias.map(a => pfx + a).join(', ')}\n`;

        return sock.sendMessage(from, { text: info }, { quoted: msg });
    }

    // ── Gawanya commands kwa category ──
    const grouped = {};
    for (const [key, cmd] of allCmds.entries()) {
        if (cmd.name === 'help') continue; // Itaonekana manually chini
        const cat = (cmd.type || 'general').toLowerCase();
        if (!grouped[cat]) grouped[cat] = [];

        // Epuka duplicates (aliases)
        const alreadyIn = grouped[cat].some(c => c.name === cmd.name);
        if (!alreadyIn) grouped[cat].push(cmd);
    }

    // ── Jenga menu ──
    const totalCmds = allCmds.size;
    let text  = `╔═══════════════════════╗\n`;
    text     += `║  🤖  *26-𝐓𝐄𝐂𝐇*        ║\n`;
    text     += `║  📋  *HELP MENU*       ║\n`;
    text     += `╚═══════════════════════╝\n\n`;
    text     += `_Prefix: *${pfx}* | Commands: *${totalCmds}*_\n`;
    text     += `_Mfano: ${pfx}ping au ${pfx}ai swali lako_\n\n`;

    // Order ya categories
    const categoryOrder = ['general', 'group', 'whatsapp', 'admin', 'owner', 'ai', 'media', 'fun', 'utility'];
    const sortedCategories = [
        ...categoryOrder.filter(c => grouped[c]),
        ...Object.keys(grouped).filter(c => !categoryOrder.includes(c))
    ];

    for (const cat of sortedCategories) {
        const cmds = grouped[cat];
        if (!cmds?.length) continue;

        const emoji = getCategoryEmoji(cat);
        text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        text += `${emoji} *${cat.toUpperCase()}* _(${cmds.length})_\n`;
        text += `━━━━━━━━━━━━━━━━━━━━━━\n`;

        for (const cmd of cmds) {
            const usage = cmd.use ? ` _${cmd.use}_` : '';
            text += `▸ *${pfx}${cmd.name}*${usage}\n`;
            text += `  └ ${cmd.info || 'Hakuna maelezo'}\n`;
            if (cmd.alias?.length > 0) {
                text += `  └ 🔀 ${cmd.alias.map(a => pfx + a).join(', ')}\n`;
            }
            text += `\n`;
        }
    }

    // Help yenyewe
    text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `▸ *${pfx}help* _[command]_\n`;
    text += `  └ Onesha menu hii au maelezo ya command\n\n`;

    text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `_⚡ Powered by 26-𝚃𝙴𝙲𝙷_`;

    await sock.sendMessage(from, { text }, { quoted: msg });
}

function getCategoryEmoji(category) {
    const map = {
        group:    '👥',
        whatsapp: '💬',
        general:  '⚙️',
        media:    '🎬',
        fun:      '🎉',
        admin:    '🛡️',
        owner:    '👑',
        utility:  '🔧',
        ai:       '🤖'
    };
    return map[category] || '📌';
}
