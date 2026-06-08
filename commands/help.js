// commands/help.js
// ════════════════════════════════════════════════════════════════
//   FIXES:
//   [1] Duplicate commands zimeondolewa — dedup kwa cmd.name
//   [2] Commands zinaonyeshwa kwa category sahihi
//   [3] Alias zinaonyeshwa vizuri
// ════════════════════════════════════════════════════════════════

export const name        = 'help';
export const description = 'Orodha ya commands zote';
export const category    = 'general';

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const pfx  = global.prefix || '.';

    const allCmds = global.allCommands || new Map();

    // FIX #1 — Dedup kwa cmd.name ili kuondoa duplicates
    // (loadCommands inaweza kuhifadhi command mara mbili — execute + plugin)
    const seen    = new Set();
    const grouped = {};

    for (const [, cmd] of allCmds.entries()) {
        // Ruka 'help' yenyewe
        if (!cmd.name || cmd.name === 'help') continue;
        // Ruka kama tumeshaweka command hii
        if (seen.has(cmd.name)) continue;
        seen.add(cmd.name);

        const cat = (cmd.type || 'general').toLowerCase();
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(cmd);
    }

    // ── Panga categories kwa mpangilio unaofaa ──
    const categoryOrder = ['general', 'ai', 'group', 'whatsapp', 'admin', 'owner', 'media', 'fun', 'utility'];
    const sortedEntries = Object.entries(grouped).sort(([a], [b]) => {
        const ai = categoryOrder.indexOf(a);
        const bi = categoryOrder.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
    });

    // ── Jenga help message ──
    let text  = `╔═══════════════════════╗\n`;
    text     += `║  🤖 *26-𝐓𝐄𝐂𝐇*         ║\n`;
    text     += `║    📋 *HELP MENU*      ║\n`;
    text     += `╚═══════════════════════╝\n\n`;

    let totalCmds = 0;

    for (const [category, cmds] of sortedEntries) {
        if (!cmds.length) continue;
        totalCmds += cmds.length;

        const emoji = getCategoryEmoji(category);
        text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        text += `${emoji} *${category.toUpperCase()}*\n`;
        text += `━━━━━━━━━━━━━━━━━━━━━━\n`;

        for (const cmd of cmds) {
            const usage = cmd.use ? ` _${cmd.use}_` : '';
            text += `▸ *${pfx}${cmd.name}*${usage}\n`;
            text += `  └ ${cmd.info || 'Hakuna maelezo'}\n`;
            if (cmd.alias?.length) {
                text += `  └ 🔀 ${cmd.alias.map(a => pfx + a).join(', ')}\n`;
            }
            text += `\n`;
        }
    }

    // Help yenyewe mwishoni
    text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `▸ *${pfx}help*\n`;
    text += `  └ Onesha menu hii\n\n`;

    text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `_📊 Commands: *${totalCmds + 1}* | Prefix: *${pfx}*_\n`;
    text += `_⚡ Powered by 26-𝚃𝙴𝙲𝙷_`;

    await sock.sendMessage(from, { text }, { quoted: msg });
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
        ai:        '🤖'
    };
    return map[category] || '📌';
}
