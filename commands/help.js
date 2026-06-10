/**
 * commands/help.js
 * Orodha ya commands zote — ikiwa na ulinzi mkali dhidi ya makosa ya 'undefined'
 */

module.exports = {
    name: 'help',
    description: 'Orodha ya commands zote',
    category: 'general',
    use: '[command]',
    alias: ['menu', 'commands'],
    adminOnly: false,

    async execute(sock, msg, args) {
        console.log("=== [HELP COMMAND] Imeshituliwa kwa Ulinzi Mpya ===");
        
        const from = msg.key.remoteJid;
        const pfx = global.prefix || '.';
        const allCmds = global.allCommands || new Map();
        
        // ULINZI 1: Kupata Sender bila kuruhusu iwe undefined
        const sender = msg.key.participant || msg.key.participantJid || msg.key.remoteJid || '';
        
        console.log(`-> Kikamilifu: sender ni ${sender}`);

        // ── Kama ametoa jina la command — toa maelezo yake peke yake ──
        if (args[0] && args[0].trim()) {
            const target = args[0].toLowerCase().trim().replace(/^\./, '');
            const cmd = allCmds.get(target);

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
            if (cmd.use)   info += `🔧 *Matumizi:* ${pfx}${cmd.name} ${cmd.use}\n`;
            if (cmd.alias?.length) info += `🔀 *Alias:* ${cmd.alias.map(a => pfx + a).join(', ')}\n`;

            return sock.sendMessage(from, { text: info }, { quoted: msg });
        }

        // 2️⃣ Kuchukua Taarifa za Mtumiaji kwa usalama
        const pushName = msg.pushName || 'Mtumiaji Mtanashati';
        
        // ULINZI 2: Kuhakikisha split haileti error hata sender ikiwa tupu
        const userNumber = sender && sender.includes('@') ? sender.split('@')[0] : 'Mtumiaji';

        // 3️⃣ PICHA YA MENU: Tumeweka ya mtandaoni ili kuepuka ulinzi wa DP wa WhatsApp
        // Unaweza kubadilisha link hii kuweka picha yoyote unayotaka mwanangu
        const menuPosterUrl = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe'; 

        // ── Gawanya commands kwa category ──
        const grouped = {};
        for (const [key, cmd] of allCmds.entries()) {
            if (!cmd || !cmd.name || cmd.name === 'help') continue;
            
            const cat = (cmd.type || cmd.category || 'general').toLowerCase();
            if (!grouped[cat]) grouped[cat] = [];

            const alreadyIn = grouped[cat].some(c => c.name === cmd.name);
            if (!alreadyIn) grouped[cat].push(cmd);
        }

        // 4️⃣ KUJENGA MUUNDO WA MENU
        let text  = `╔═══════════════════════╗\n`;
        text     += `║   *26-𝐓𝐄𝐂𝐇 𝐌𝐄𝐍𝐔* ║\n`;
        text     += `╚═══════════════════════╝\n\n`;
        
        text     += `👤 *TAARIFA ZAKO:* \n`;
        text     += `├─ *Jina:* ${pushName}\n`;
        text     += `├─ *Namba:* +${userNumber}\n`;
        text     += `└─ *Hali ya Mfumo:* Latency ni 2ms ⚡\n\n`;
        
        text     += `🤖 *TAARIFA ZA BOTI:* \n`;
        text     += `├─ *Jina la Boti:* 26-𝐓𝐄𝐂𝐇\n`;
        text     += `├─ *Prefix:* [ ${pfx} ]\n`;
        text     += `└─ *Jumla ya Amri:* ${allCmds.size} zilizopakiwa\n\n`;

        text     += `_Mfano: ${pfx}ping au ${pfx}ai swali lako_\n\n`;

        const categoryOrder = ['general', 'group', 'whatsapp', 'admin', 'owner', 'ai', 'media', 'fun', 'utility', 'textmaker'];
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
                const cmdInfo = cmd.info || cmd.description || 'Hakuna maelezo';
                
                text += `▸ *${pfx}${cmd.name}*${usage}\n`;
                text += `  └ ${cmdInfo}\n`;
                if (cmd.alias?.length > 0) {
                    text += `  └ 🔀 ${cmd.alias.map(a => pfx + a).join(', ')}\n`;
                }
                text += `\n`;
            }
        }

        text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        text += `▸ *${pfx}help* _[command]_\n`;
        text += `  └ Onesha menu hii au maelezo ya command\n\n`;

        text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        text += `_⚡ Powered by 26-𝚃𝙴𝙲𝙷_`;

        // 5️⃣ KUTUMA KETE KWA USALAMA (Kama picha ikifeli, maandishi yanatoka)
        try {
            await sock.sendMessage(from, {
                image: { url: menuPosterUrl },
                caption: text
            }, { quoted: msg });
            console.log("[SUCCESS] Help menu imetumwa vizuri!");
        } catch (error) {
            console.error("[FALLBACK] Kutuma kwa picha imefeli, tunatuma kwa text tu:", error);
            await sock.sendMessage(from, { text: text }, { quoted: msg });
        }
    }
};

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
        textmaker: '🎨'
    };
    return map[category] || '📌';
}
