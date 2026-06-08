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
// ║  (imported from config.js and re-exported)   ║
// ╚══════════════════════════════════════════════╝
export const prefix = _prefix || '.';


// ╔══════════════════════════════════════════════╗
// ║         ✅ ADDED: export Config              ║
// ║  (built from packname & author in config.js) ║
// ╚══════════════════════════════════════════════╝
export const Config = {
   caption: `*${packname || "26-TECH"}* | _${author || "Bot"}_`
};


// ╔══════════════════════════════════════════════╗
// ║         ✅ ADDED: export tlang               ║
// ║  (returns group/admin/owner error messages)  ║
// ╚══════════════════════════════════════════════╝
export const tlang = () => ({
   group: "*_This command is for groups only!_*",
   admin: "*_You or I must be admin to use this!_*",
   owner: "*_This command is for owner only!_*"
});


// ╔══════════════════════════════════════════════╗
// ║         ✅ ADDED: export sleep               ║
// ║  (promise-based delay, e.g. sleep(1500))     ║
// ╚══════════════════════════════════════════════╝
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));


// ╔══════════════════════════════════════════════╗
// ║         ✅ ADDED: export getAdmin            ║
// ║  (filters admin participants from a group)   ║
// ╚══════════════════════════════════════════════╝
export const getAdmin = (participants) => {
   return participants
      .filter(p => p.admin === "admin" || p.admin === "superadmin")
      .map(p => p.id);
};


// ╔══════════════════════════════════════════════╗
// ║         ✅ ADDED: export send                ║
// ║  (sends a message to a chat via bot)         ║
// ╚══════════════════════════════════════════════╝
export const send = async (m, text, options = {}, _a = "", _b = "", jid = null) => {
   const chatId = jid || m.chat;
   return await m.bot.sendMessage(chatId, { text, ...options });
};


// ╔══════════════════════════════════════════════╗
// ║         ✅ ADDED: export sck                 ║
// ║  (socket reference, set when bot connects)   ║
// ╚══════════════════════════════════════════════╝
let _sck = null;
export const sck = () => _sck;
export const setSck = (sock) => { _sck = sock; };


// ╔══════════════════════════════════════════════╗
// ║         ✅ ADDED: export smd                 ║
// ║  (re-exported from plugins.js astro_patch)   ║
// ╚══════════════════════════════════════════════╝
export const smd = astro_patch.smd;


// ╔══════════════════════════════════════════════╗
// ║     ✅ ADDED: export updateProfilePicture    ║
// ║  (downloads media and sets profile picture)  ║
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
// ║  (normalizes a WhatsApp JID format)          ║
// ╚══════════════════════════════════════════════╝
export const parsedJid = (jid) => {
   if (!jid) return null;
   return jid.includes(':') ? jid.split(':')[0] + '@s.whatsapp.net' : jid;
};


// ════════════════════════════════════════════════
//           ORIGINAL CODE BELOW (unchanged)
// ════════════════════════════════════════════════

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
                commands.set(cmd.name, cmd);
                console.log(`✅ Command loaded: ${cmd.name}`);
            } else {
                console.warn(`⚠️ Command ${file} missing name or execute`);
            }
        } catch (err) {
            console.error(`❌ Failed to load command ${file}:`, err.message);
        }
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

        const hasPrefix = /^\.(ai|bot)\s*/i.test(text);
        const userActivated = activatedUsers.has(senderLid);

        if (!hasPrefix && !isReply) return;
        if (isReply && !hasPrefix && !userActivated) return;

        if (hasPrefix) activatedUsers.add(senderLid);

        let cmdName, args;

        if (hasPrefix) {
            cmdName = 'ai';
            args = text.replace(/^\.(ai|bot)\s*/i, '').trim().split(/\s+/);
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
