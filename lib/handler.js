import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
   prefix as _prefix,
   packname,
   author
} from '../config.js';
import astro_patch from './plugins.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let commands = new Map();
const activatedUsers = new Set();


// ╔══════════════════════════════════════════════╗
// ║         ✅ ADDED: export prefix              ║
// ╚══════════════════════════════════════════════╝
export const prefix = _prefix || '.';


// ╔══════════════════════════════════════════════╗
// ║         ✅ ADDED: export Config              ║
// ╚══════════════════════════════════════════════╝
export const Config = {
   caption: `*${packname || "26-TECH"}* | _${author || "Bot"}_`
};


// ╔══════════════════════════════════════════════╗
// ║         ✅ ADDED: export tlang               ║
// ╚══════════════════════════════════════════════╝
export const tlang = () => ({
   group: "*_This command is for groups only!_*",
   admin: "*_You or I must be admin to use this!_*",
   owner: "*_This command is for owner only!_*"
});


// ╔══════════════════════════════════════════════╗
// ║         ✅ ADDED: export sleep               ║
// ╚══════════════════════════════════════════════╝
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));


// ╔══════════════════════════════════════════════╗
// ║         ✅ ADDED: export getAdmin            ║
// ╚══════════════════════════════════════════════╝
export const getAdmin = (participants) => {
   return participants
      .filter(p => p.admin === "admin" || p.admin === "superadmin")
      .map(p => p.id);
};


// ╔══════════════════════════════════════════════╗
// ║         ✅ ADDED: export send                ║
// ╚══════════════════════════════════════════════╝
export const send = async (m, text, options = {}, _a = "", _b = "", jid = null) => {
   const chatId = jid || m.chat;
   return await m.bot.sendMessage(chatId, { text, ...options });
};


// ╔══════════════════════════════════════════════╗
// ║         ✅ ADDED: export sck                 ║
// ╚══════════════════════════════════════════════╝
let _sck = null;
export const sck = () => _sck;
export const setSck = (sock) => { _sck = sock; };


// ╔══════════════════════════════════════════════╗
// ║         ✅ ADDED: export smd                 ║
// ╚══════════════════════════════════════════════╝
export const smd = astro_patch.smd;


// ╔══════════════════════════════════════════════╗
// ║     ✅ ADDED: export updateProfilePicture    ║
// ╚══════════════════════════════════════════════╝
export async function updateProfilePicture(m, jid, mediaMsg, type = "gpp") {
   try {
      const media = await m.bot.downloadMediaMessage(mediaMsg);
      await m.bot.updateProfilePicture(jid, { img: media });
      return await m.reply("*_✅ Profile picture updated successfully!_*");
   } catch (e) {
      return await m.reply("*_❌ Failed to update profile picture!_*");
   }
}


// ╔══════════════════════════════════════════════╗
// ║         ✅ ADDED: export parsedJid           ║
// ╚══════════════════════════════════════════════╝
export const parsedJid = (jid) => {
   if (!jid) return null;
   return jid.includes(':') ? jid.split(':')[0] + '@s.whatsapp.net' : jid;
};


// ════════════════════════════════════════════════
//           ORIGINAL CODE BELOW (unchanged)
// ════════════════════════════════════════════════

// ╔══════════════════════════════════════════════════════════╗
// ║  global.allCommands — Map inayohifadhi commands ZOTE     ║
// ║  help.js inasoma kutoka hapa automatically               ║
// ║  Kila command mpya utakayoongeza itaonekana .help        ║
// ╚══════════════════════════════════════════════════════════╝
global.allCommands = global.allCommands || new Map();

export async function loadCommands() {
    const commandsPath = path.join(__dirname, '../commands');
    if (!fs.existsSync(commandsPath)) return;

    const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

    for (const file of files) {
        try {
            const cmdPath = path.join(commandsPath, file);
            const module = await import(`file://${cmdPath}`);
            const cmd = module.default || module;

            if (cmd.name && typeof cmd.execute === 'function') {
                // ✅ Style 1: name/execute (ai.js, ping.js, help.js, n.k)
                commands.set(cmd.name, cmd);

                // Hifadhi kwenye global.allCommands kwa help.js
                global.allCommands.set(cmd.name, {
                    name: cmd.name,
                    info: cmd.description || 'Hakuna maelezo',
                    use: cmd.use || '',
                    type: cmd.category || cmd.type || 'general',
                    alias: cmd.alias || [],
                    style: 'execute'
                });

                console.log(`✅ Command loaded: ${cmd.name}`);
            } else {
                // ✅ Style 2: smd/cmd plugins (group.js, n.k)
                console.log(`✅ Plugin loaded: ${file}`);
            }
        } catch (err) {
            console.error(`❌ Failed to load command ${file}:`, err.message);
        }
    }

    // ✅ Baada ya plugins kupakia, ongeza plugin commands kwenye global.allCommands
    const { commands: pluginCommands } = await import('./plugins.js');
    for (const [key, cmd] of pluginCommands.entries()) {
        global.allCommands.set(key, {
            name: cmd.cmdname || cmd.pattern || key,
            info: cmd.info || cmd.desc || cmd.description || 'Hakuna maelezo',
            use: cmd.use || '',
            type: cmd.type || cmd.category || 'general',
            alias: cmd.alias || [],
            style: 'plugin'
        });
    }
}

function getCommand(name) {
    return commands.get(name);
}

export async function handleMessage(sock, msg) {
    try {
        setSck(sock);

        const chatJid = msg.key.remoteJid;
        const senderLid = msg.key.participant || chatJid;

        const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption ||
            '';

        if (!text) return;

        const pfx = global.prefix || prefix || '.';

        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        const quotedStanzaId = contextInfo?.stanzaId || '';
        const quotedParticipant = contextInfo?.participant || '';
        const isDM = !chatJid.endsWith('@g.us');

        const botId = sock.user?.id || '';
        const botLid = sock.user?.lid || '';
        const botNumber = botId.replace(/:.*@/, '').replace(/@.*/, '');
        const botLidNumber = botLid.replace(/:.*@/, '').replace(/@.*/, '');

        const isReplyInDM = isDM && !!quotedStanzaId;
        const isReplyInGroup = Boolean(
            (botNumber && quotedParticipant.includes(botNumber)) ||
            (botLidNumber && quotedParticipant.includes(botLidNumber))
        );
        const isReply = isReplyInDM || isReplyInGroup;

        // Gundua prefix yoyote (si .ai/.bot tu)
        const pfxEscaped = pfx.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const prefixRegex = new RegExp(`^${pfxEscaped}(\\w+)`, 'i');
        const hasPrefix = prefixRegex.test(text);
        const userActivated = activatedUsers.has(senderLid);

        if (!hasPrefix && !isReply) return;
        if (isReply && !hasPrefix && !userActivated) return;

        if (hasPrefix) activatedUsers.add(senderLid);

        let cmdName, args;
        const match = text.match(prefixRegex);

        if (match) {
            cmdName = match[1].toLowerCase();
            args = text.slice(match[0].length).trim().split(/\s+/);
        } else {
            cmdName = 'ai';
            args = text.split(/\s+/);
        }

        const cmd = getCommand(cmdName);
        if (!cmd) return;

        msg.senderLid = senderLid;
        await cmd.execute(sock, msg, args);

    } catch (err) {
        console.error('Message handler error:', err);
    }
}

export function setupContactListener(sock) {
    if (!sock || !sock.ev) return;

    const contactCache = new Map();

    sock.ev.on('contacts.update', (contacts) => {
        if (!Array.isArray(contacts)) return;
        for (const c of contacts) {
            const lid = c.id;
            if (!lid) continue;
            contactCache.set(lid, {
                name: c.notify || c.name || '',
                verifiedName: c.verifiedName || '',
                imgUrl: c.imgUrl || null,
                jid: c.jid || null,
                updatedAt: Date.now()
            });
        }
    });

    global.contactCache = contactCache;
    global.getPhoneNumberFromLid = async (sock, lid) => {
        try {
            const info = await sock.getLid(lid);
            return info?.jid || null;
        } catch {
            return null;
        }
    };
}
