/**
 * commands/help.js
 * Orodha ya commands zote — ikiwa na Console Logs za kutafuta tatizo (Debugging)
 */

module.exports = {
    name: 'help',
    description: 'Orodha ya commands zote',
    category: 'general',
    use: '[command]',
    alias: ['menu', 'commands'],
    adminOnly: false,

    async execute(sock, msg, args) {
        console.log("=== [HELP COMMAND] Imeshituliwa! ===");
        
        const from = msg.key.remoteJid;
        const pfx = global.prefix || '.';
        const allCmds = global.allCommands || new Map();
        const sender = msg.key.participant || msg.key.remoteJid;

        console.log(`-> Inatoka kwa: ${sender}`);
        console.log(`-> Jumla ya commands kwenye global.allCommands: ${allCmds.size}`);

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

        // 1️⃣ Kuchukua Taarifa za Mtumiaji
        const pushName = msg.pushName || 'Mtumiaji Mtanashati';
        const userNumber = sender.split('@')[0];

        // 2️⃣ Jaribio la Kuvuta DP (Hapa ndipo tunapoweka darubini ya Log)
        let profilePicUrl = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe'; // Picha mbadala ya mtandaoni
        
        console.log("-> Jaribio la kuvuta Profile Picture kutoka WhatsApp...");
        try {
            const wpPpUrl = await sock.profilePictureUrl(sender, 'image');
            console.log(`[SUCCESS] Picha ya DP imepatikana kwa mafanikio: ${wpPpUrl}`);
            profilePicUrl = wpPpUrl;
        } catch (ppError) {
            console.log(`[WARNING] PP ya WhatsApp imegoma au ina ulinzi. Sababu: ${ppError.message}`);
            console.log("-> Tunatumia picha mbadala (Fallback Image) ili boti isikwame.");
        }

        // ── Gawanya commands kwa category ──
        console.log("-> Inaanza kupanga commands kulingana na kategoria...");
        const grouped = {};
        try {
            for (const [key, cmd] of allCmds.entries()) {
                if (!cmd || !cmd.name || cmd.name === 'help') continue;
                
                const cat = (cmd.type || cmd.category || 'general').toLowerCase();
                if (!grouped[cat]) grouped[cat] = [];

                const alreadyIn = grouped[cat].some(c => c.name === cmd.name);
                if (!alreadyIn) grouped[cat].push(cmd);
            }
            console.log(`[SUCCESS] Kategoria zilizopatikana: ${Object.keys(grouped).join(', ')}`);
        } catch (groupError) {
            console.error("[CRITICAL ERROR] Kosa wakati wa kupanga kategoria:", groupError);
        }

        // 3️⃣ Kujenga Maandishi ya Menu
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

        // 4️⃣ Kujaribu Kutuma Menu yenye Picha
        console.log("-> Inajaribu kutuma ujumbe wa picha na maandishi kwenda WhatsApp...");
        try {
            await sock.sendMessage(from, {
                image: { url: profilePicUrl },
                caption: text
            }, { quoted: msg });
            console.log("[SUCCESS] Help Menu imetumwa kwa picha na caption!");
        } catch (sendError) {
            console.error("[ERROR] Kutuma picha imefeli kabisa! Sababu:", sendError);
            
            // Kama picha (url yake au buffer yake) ikigoma, tunatuma maandishi matupu ili boti isilete ukimya
            console.log("-> Tunajaribu kutuma maandishi matupu (Text Only Fallback)...");
            try {
                await sock.sendMessage(from, { text: text }, { quoted: msg });
                console.log("[SUCCESS] Maandishi ya help yametumwa kwa mafanikio bila picha!");
            } catch (fallbackError) {
                console.error("[CRITICAL] Hata maandishi yamewaka moto kushindwa kutumwa:", fallbackError);
            }
        }
        console.log("=== [HELP COMMAND] Kazi Imeisha! ===\n");
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
