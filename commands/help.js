// commands/help.js
export const name = 'help';
export const description = 'Orodha ya commands zote';
export const category = 'general';

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const pfx = global.prefix || '.';

    // ✅ Soma commands ZOTE kutoka global.allCommands
    // (inajaza automatically na loadCommands() kwenye handler.js)
    const allCmds = global.allCommands || new Map();

    // Gawanya kwa category
    const grouped = {};
    for (const [key, cmd] of allCmds.entries()) {
        // Ruka 'help' yenyewe — itaonekana manually chini
        if (cmd.name === 'help') continue;
        const cat = (cmd.type || 'general').toLowerCase();
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(cmd);
    }

    // ============================
    // Jenga help message
    // ============================
    let text = `╔═══════════════════════╗\n`;
    text += `║  🤖 *26-𝚃𝙴𝙲𝙷*   ║\n`;
    text += `║    📋 *HELP MENU*       ║\n`;
    text += `╚═══════════════════════╝\n\n`;

    // Commands zilizogroupiwa kwa category
    for (const [category, cmds] of Object.entries(grouped)) {
        if (cmds.length === 0) continue;
        const emoji = getCategoryEmoji(category);
        text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        text += `${emoji} *${category.toUpperCase()}*\n`;
        text += `━━━━━━━━━━━━━━━━━━━━━━\n`;

        for (const cmd of cmds) {
            const usage = cmd.use ? ` _${cmd.use}_` : '';
            text += `▸ *${pfx}${cmd.name}*${usage}\n`;
            text += `  └ ${cmd.info}\n`;
            if (cmd.alias && cmd.alias.length > 0) {
                text += `  └ 🔀 Alias: ${cmd.alias.map(a => pfx + a).join(', ')}\n`;
            }
            text += `\n`;
        }
    }

    // Help yenyewe mwishoni
    text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `▸ *${pfx}help*\n`;
    text += `  └ Onesha menu hii\n\n`;

    text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `_📊 Commands: *${allCmds.size}* | Prefix: *${pfx}*_\n`;
    text += `_⚡ Powered by 26-𝚃𝙴𝙲𝙷_`;

    await sock.sendMessage(from, { text }, { quoted: msg });
}

function getCategoryEmoji(category) {
    const map = {
        group: '👥',
        whatsapp: '💬',
        general: '⚙️',
        media: '🎬',
        fun: '🎉',
        admin: '🛡️',
        owner: '👑',
        utility: '🔧',
        ai: '🤖'
    };
    return map[category] || '📌';
}
