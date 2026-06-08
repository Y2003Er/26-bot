// lib/handler.js
// ════════════════════════════════════════════════════════════════
//   26-TECH BOT — HANDLER.JS (FIXED)
//
//   FIXES:
//   [1] Context object "m" inajengwa vizuri — commands za group zinafanya kazi
//   [2] Plugin handler signature imesahihishwa
//   [3] isActualOwner logic imeimarishwa
//   [4] Auto status viewer haitumi forward — react tu
//   [5] isReplyToBot DM detection imeboreshwa
//   [6] adminOnly check inafanya kazi kwa type:"group" commands
//   [7] Anti-delete TTL imewekwa
// ════════════════════════════════════════════════════════════════

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import {
    prefix as _prefix,
    packname,
    author
} from '../config.js';
import astro_patch from './plugins.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ════════════════════════════════════════════════
//   OWNER NUMBER
// ════════════════════════════════════════════════
const RAW_OWNER  = (process.env.OWNER_NUMBER || '255753495142').replace(/[^0-9]/g, '');
const OWNER_JID  = `${RAW_OWNER}@s.whatsapp.net`;

// ════════════════════════════════════════════════
//   EXPORTS ZA KAWAIDA
// ════════════════════════════════════════════════
export const prefix = _prefix || '.';

export const Config = {
    caption: `*${packname || '26-TECH'}* | _${author || 'Bot'}_`
};

export const tlang = () => ({
    group: '*_This command is for groups only!_*',
    admin: '*_You or I must be admin to use this!_*',
    owner: '*_This command is for owner only!_*'
});

export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const getAdmin = (participants) =>
    participants
        .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
        .map(p => p.id);

export const parsedJid = (jid) => {
    if (!jid) return null;
    return jid.includes(':') ? jid.split(':')[0] + '@s.whatsapp.net' : jid;
};

export const send = async (m, text, options = {}, _a = '', _b = '', jid = null) => {
    const chatId = jid || m.chat;
    return await m.bot.sendMessage(chatId, { text, ...options });
};

export const smd = astro_patch.smd;

export async function updateProfilePicture(m, jid, mediaMsg, type = 'gpp') {
    try {
        const media = await m.bot.downloadMediaMessage(mediaMsg);
        await m.bot.updateProfilePicture(jid, { img: media });
        return await m.reply('*_✅ Profile picture updated successfully!_*');
    } catch {
        return await m.reply('*_❌ Failed to update profile picture!_*');
    }
}

let _sck = null;
export const sck    = () => _sck;
export const setSck = (sock) => { _sck = sock; };

// ════════════════════════════════════════════════
//   COMMANDS MAP
// ════════════════════════════════════════════════
const commands = new Map();
global.allCommands = global.allCommands || new Map();

export async function loadCommands() {
    commands.clear();
    global.allCommands.clear();

    const commandsPath = path.join(__dirname, '../commands');
    if (fs.existsSync(commandsPath)) {
        const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
        for (const file of files) {
            try {
                const cmdPath = path.join(commandsPath, file);
                const module  = await import(`file://${cmdPath}?t=${Date.now()}`);
                const cmd     = module.default || module;

                if (cmd.name && typeof cmd.execute === 'function') {
                    commands.set(cmd.name.toLowerCase(), cmd);
                    if (Array.isArray(cmd.alias)) {
                        cmd.alias.forEach(a => commands.set(a.toLowerCase(), cmd));
                    }
                    global.allCommands.set(cmd.name.toLowerCase(), {
                        name:  cmd.name,
                        info:  cmd.description || 'Hakuna maelezo',
                        use:   cmd.use || '',
                        type:  cmd.category || cmd.type || 'general',
                        alias: cmd.alias || [],
                        style: 'execute'
                    });
                    console.log(`✅ Command loaded: ${cmd.name}`);
                } else {
                    console.log(`✅ Plugin loaded: ${file}`);
                }
            } catch (err) {
                console.error(`❌ Failed to load command ${file}:`, err.message);
            }
        }
    }

    // Plugin commands kutoka plugins.js
    try {
        // Tumia dynamic import na timestamp ili kuzuia cache ya Node.js
        const pluginsModule = await import(`./plugins.js?t=${Date.now()}`);
        const pluginCommands = pluginsModule.commands;
        const astro          = pluginsModule.default;

        // FIX #4 (plugins.js) — clear plugin Map kabla ya ku-reload
        // Hii inazuia commands za zamani kubaki baada ya restart
        if (typeof astro?.clear === 'function') astro.clear();

        // Re-import baada ya clear ili kupata commands mpya
        // (commands zimesajiliwa wakati wa import ya command files)
        // Kwa hivyo tunategemea pluginCommands Map ambayo imejazwa
        // na group.js, n.k. wakati wa import hapo juu

        for (const [key, cmd] of pluginCommands.entries()) {
            const commandName = (cmd.cmdname || cmd.pattern || key).toLowerCase();

            // FIX #2 — Tumia style flag kutoka plugins.js
            // style:'smd' → handler inatarajia (m, text, opts) — wrap na buildContext
            // style:'cmd' → handler inatarajia (m, text) — wrap na buildContext pia
            // Zote mbili zinatumia m context object
            const executeFunc = async (sock, msg, args) => {
                const m    = await buildContext(sock, msg);
                const text = args.join(' ');
                const opts = { smd: commandName, cmdName: commandName };

                if (typeof cmd.handler === 'function') {
                    return await cmd.handler(m, text, opts);
                }
                if (typeof cmd.execute === 'function') {
                    return await cmd.execute(sock, msg, args);
                }
                if (typeof cmd.func === 'function') {
                    return await cmd.func(m, text, opts);
                }
            };

            // Hifadhi flags kutoka plugins.js mpya
            commands.set(commandName, {
                name:       commandName,
                execute:    executeFunc,
                description: cmd.info || cmd.desc || cmd.description || 'Hakuna maelezo',
                use:        cmd.use || '',
                category:   cmd.type || cmd.category || 'general',
                alias:      cmd.alias || [],
                adminOnly:  cmd.adminOnly  === true,   // kutoka plugins.js registerCommand
                needsGroup: cmd.needsGroup === true,   // kutoka plugins.js registerCommand
                ownerOnly:  cmd.ownerOnly  === true,   // kutoka plugins.js registerCommand
                style:      cmd.style || 'smd',
            });

            // Hifadhi kwenye global.allCommands kwa help command
            // Ruka aliases — zitaonekana mara moja tu kwenye help
            const isAlias = Array.isArray(cmd.alias) &&
                cmd.alias.some(a => a.toLowerCase() === commandName) &&
                (cmd.cmdname || cmd.pattern || '').toLowerCase() !== commandName;

            if (!isAlias) {
                global.allCommands.set(commandName, {
                    name:  commandName,
                    info:  cmd.info || cmd.desc || cmd.description || 'Hakuna maelezo',
                    use:   cmd.use || '',
                    type:  cmd.type || cmd.category || 'general',
                    alias: cmd.alias || [],
                    style: cmd.style || 'smd',
                });
            }
        }
        console.log(`✅ Plugin commands loaded: ${pluginCommands.size}`);
    } catch (err) {
        console.error('❌ Plugin load error:', err.message);
    }
}

function getCommand(name) {
    return commands.get(name?.toLowerCase());
}

// ════════════════════════════════════════════════
//   HELPERS
// ════════════════════════════════════════════════

/** Ondoa device suffix: "255....:5@s.whatsapp.net" → "255....@s.whatsapp.net" */
function normalizeJid(jid) {
    if (!jid) return '';
    return jid.replace(/:\d+@/, '@');
}

function isOwnerJid(jid) {
    return normalizeJid(jid) === normalizeJid(OWNER_JID);
}

// ════════════════════════════════════════════════════════════════
//
//   🏗️ BUILD CONTEXT OBJECT "m"
//
//   FIX #1 — Context object inayofanya kazi na commands za group.js
//   Commands zinategemea: m.reply(), m.send(), m.bot, m.chat,
//   m.sender, m.isGroup, m.isAdmin, m.isBotAdmin, m.isCreator,
//   m.metadata, m.mentionedJid, m.quoted, m.mtype, m.reply_message
//
// ════════════════════════════════════════════════════════════════
async function buildContext(sock, msg) {
    const chatJid  = msg.key.remoteJid;
    const isGroup  = chatJid?.endsWith('@g.us');
    const isFromMe = msg.key.fromMe === true;

    const rawSender = isGroup
        ? (msg.key.participant || msg.key.remoteJid)
        : chatJid;
    const senderJid = normalizeJid(rawSender);

    // Group metadata (kwa group commands)
    let metadata     = null;
    let participants = [];
    let adminList    = [];
    let isBotAdmin   = false;
    let isAdmin      = false;

    if (isGroup) {
        try {
            metadata     = await sock.groupMetadata(chatJid);
            participants = metadata.participants || [];
            adminList    = getAdmin(participants);

            const botId  = normalizeJid(sock.user?.id || '');
            isBotAdmin   = adminList.some(a => normalizeJid(a) === botId);
            isAdmin      = adminList.some(a => normalizeJid(a) === senderJid);
        } catch {}
    }

    // Quoted message
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    let quoted        = null;
    if (contextInfo?.quotedMessage) {
        const qMsg   = contextInfo.quotedMessage;
        const qMtype = Object.keys(qMsg)[0] || '';
        quoted = {
            msg:         qMsg,
            mtype:       qMtype,
            sender:      normalizeJid(contextInfo.participant || ''),
            text:        qMsg?.conversation || qMsg?.extendedTextMessage?.text || '',
            groupInvite: qMsg?.groupInviteMessage || null,
        };
    }

    // Detected mtype
    const mtype = Object.keys(msg.message || {})[0] || '';

    // Text
    const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption     ||
        msg.message?.videoMessage?.caption     || '';

    // Mentioned JIDs
    const mentionedJid =
        contextInfo?.mentionedJid ||
        msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    // Push name
    const pushName = msg.pushName || '';

    // ── m object ──
    const m = {
        // Raw data
        raw:          msg,
        bot:          sock,
        chat:         chatJid,
        sender:       senderJid,
        pushName,
        user:         sock.user?.id || '',

        // Booleans
        isGroup,
        isFromMe,
        isCreator:    isOwnerJid(senderJid) || (isGroup && isFromMe),
        isAdmin,
        isBotAdmin,

        // Content
        mtype,
        text,
        reply_text:   text,
        mentionedJid,
        metadata,
        quoted,
        reply_message: quoted,

        // ── Methods ──

        /** Jibu ujumbe huu */
        reply: async (content, opts = {}) => {
            if (typeof content === 'string') {
                return await sock.sendMessage(chatJid, { text: content, ...opts }, { quoted: msg });
            }
            return await sock.sendMessage(chatJid, { ...content, ...opts }, { quoted: msg });
        },

        /** Tuma ujumbe mpya (si reply) */
        send: async (content, opts = {}) => {
            if (typeof content === 'string') {
                return await sock.sendMessage(chatJid, { text: content, ...opts });
            }
            return await sock.sendMessage(chatJid, { ...content, ...opts });
        },

        /** React na emoji */
        react: async (emoji) => {
            return await sock.sendMessage(chatJid, {
                react: { text: emoji, key: msg.key }
            });
        },

        /** Download media kutoka kwa message hii au quoted */
        downloadMedia: async (targetMsg = null) => {
            const source = targetMsg || msg;
            const mediaMsg =
                source.message?.imageMessage ||
                source.message?.videoMessage ||
                source.message?.audioMessage ||
                source.message?.stickerMessage ||
                source.message?.documentMessage;
            if (!mediaMsg) return null;
            const mtype2 =
                source.message?.imageMessage   ? 'image'    :
                source.message?.videoMessage   ? 'video'    :
                source.message?.audioMessage   ? 'audio'    :
                source.message?.stickerMessage ? 'sticker'  : 'document';
            const stream = await downloadContentFromMessage(mediaMsg, mtype2);
            let buffer   = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            return buffer;
        },

        /** Download media ya quoted message */
        downloadMediaMessage: async (mediaMsg) => {
            if (!mediaMsg) return null;
            const msg2 = mediaMsg.raw || mediaMsg;
            const imgM  = msg2?.message?.imageMessage   || msg2?.imageMessage;
            const vidM  = msg2?.message?.videoMessage   || msg2?.videoMessage;
            const audM  = msg2?.message?.audioMessage   || msg2?.audioMessage;
            const stkM  = msg2?.message?.stickerMessage || msg2?.stickerMessage;
            const source = imgM || vidM || audM || stkM;
            if (!source) return null;
            const t = imgM ? 'image' : vidM ? 'video' : audM ? 'audio' : 'sticker';
            const stream = await downloadContentFromMessage(source, t);
            let buffer   = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            return buffer;
        },

        /** Error handler — log na jibu */
        error: async (logMsg, _err, replyMsg = null) => {
            console.error('Command error:', logMsg);
            if (replyMsg) {
                await sock.sendMessage(chatJid, { text: replyMsg }, { quoted: msg });
            }
        },
    };

    return m;
}

// ════════════════════════════════════════════════════════════════
//
//   📨 MAIN MESSAGE HANDLER
//
//   ROUTING LOGIC:
//   ┌──────────────────────────────────────────────────────────────┐
//   │ DM kutoka own number (fromMe=true)  → IGNORE kabisa          │
//   │ DM kutoka mtu mwingine              → commands zote za DM    │
//   │                                                              │
//   │ Group — own number + ana admin      → commands zote ✅       │
//   │ Group — own number bila admin       → commands ambazo        │
//   │         hazihitaji admin zinafanya kazi; zinazohitaji admin  │
//   │         → jibu kwa owner DM (si group)                       │
//   │ Group — watu wengine                → .ai/.bot TU            │
//   └──────────────────────────────────────────────────────────────┘
//
// ════════════════════════════════════════════════════════════════
export async function handleMessage(sock, msg) {
    try {
        setSck(sock);

        const chatJid  = msg.key.remoteJid;
        const isGroup  = chatJid?.endsWith('@g.us');
        const isDM     = !isGroup;
        const isFromMe = msg.key.fromMe === true;

        // Sender JID
        const rawSender = isGroup ? (msg.key.participant || '') : chatJid;
        const senderJid = normalizeJid(rawSender);

        // FIX #3 — isActualOwner: kwenye group tumia senderJid tu
        // fromMe=true peke yake haithibitishi owner (multi-device)
        const isActualOwner = isOwnerJid(senderJid) ||
            // Kwenye group: fromMe=true inamaanisha owner alituma (device yake)
            // Lakini lazima pia senderJid iwe tupu (baileys inaweza kutorudi participant)
            (isGroup && isFromMe && !rawSender);

        // ── DM kutoka own number (bot ikijiandikia au owner ajiandikia) → IGNORE ──
        if (isDM && isFromMe) return;

        // Pata text ya ujumbe
        const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption     ||
            msg.message?.videoMessage?.caption     || '';

        if (!text?.trim()) return;

        const pfx         = global.prefix || prefix || '.';
        const pfxEscaped  = pfx.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const prefixRegex = new RegExp(`^${pfxEscaped}([\\w]+)`, 'i');
        const hasPrefix   = prefixRegex.test(text.trim());

        // ── Reply detection ──
        const contextInfo       = msg.message?.extendedTextMessage?.contextInfo;
        const quotedStanzaId    = contextInfo?.stanzaId    || '';
        const quotedParticipant = contextInfo?.participant || '';

        const botId        = sock.user?.id  || '';
        const botLid       = sock.user?.lid || '';
        const botNumber    = botId.replace(/:.*@/, '').replace(/@.*/, '');
        const botLidNumber = botLid.replace(/:.*@/, '').replace(/@.*/, '');

        // FIX #5 — isReplyToBot: DM inahitaji quoted message yenye bot sender
        // Si kila quoted message ni reply ya bot
        const isReplyToBotInDM = isDM && !!quotedStanzaId && (
            msg.message?.extendedTextMessage?.contextInfo?.fromMe === true ||
            (botNumber && quotedParticipant?.includes(botNumber)) ||
            (botLidNumber && quotedParticipant?.includes(botLidNumber))
        );

        const isReplyToBotInGroup = !isDM && (
            (botNumber    && quotedParticipant?.includes(botNumber))    ||
            (botLidNumber && quotedParticipant?.includes(botLidNumber))
        );

        const isReplyToBot = isReplyToBotInDM || isReplyToBotInGroup;

        // ────────────────────────────────────────────────
        //   ROUTING: GROUP
        // ────────────────────────────────────────────────
        if (isGroup) {

            // ── Watu wengine kwenye group: .ai/.bot TU ──
            if (!isActualOwner) {
                const isAiCommand = /^\.(ai|bot|photo)\s*/i.test(text.trim()) || isReplyToBot;
                if (!isAiCommand) return;

                const aiCmd = getCommand('ai');
                if (aiCmd) await aiCmd.execute(sock, msg, text.trim().split(/\s+/));
                return;
            }

            // ── Owner kwenye group — lazima awe na prefix au reply ──
            if (!hasPrefix && !isReplyToBot) return;

            const match   = text.trim().match(prefixRegex);
            const cmdName = match
                ? match[1].toLowerCase()
                : (isReplyToBot ? 'ai' : null);
            if (!cmdName) return;

            const args = match
                ? text.trim().slice(match[0].length).trim().split(/\s+/)
                : text.trim().split(/\s+/);

            const cmd = getCommand(cmdName);
            if (!cmd) {
                await sock.sendMessage(OWNER_JID, {
                    text: `❓ Command *${pfx}${cmdName}* haipatikani.\nTumia *${pfx}help* kuona commands zote.`
                });
                return;
            }

            // ── FIX #6 — Angalia kama command inahitaji admin au group ──
            // type:"group" commands (rejectall, setdesc, tagall, n.k.) zinahitaji admin
            const needsAdmin =
                cmd.adminOnly   === true       ||
                cmd.category    === 'admin'    ||
                cmd.type        === 'admin'    ||
                cmd.needsGroup  === true;      // type:"group" plugins

            // Pata group metadata kujua kama owner ni admin
            let ownerIsAdmin = false;
            try {
                const meta        = await sock.groupMetadata(chatJid);
                const participant = meta.participants.find(
                    p => normalizeJid(p.id) === senderJid
                );
                ownerIsAdmin =
                    participant?.admin === 'admin' ||
                    participant?.admin === 'superadmin';
            } catch {}

            if (needsAdmin && !ownerIsAdmin) {
                // Owner hana admin — arifu kwa DM badala ya kujibu group
                await sock.sendMessage(OWNER_JID, {
                    text: `⚠️ *Command inahitaji admin*\n\n` +
                          `Ulijaribu: *${pfx}${cmdName}* kwenye group\n` +
                          `Lakini huna admin privileges hapo.\n\n` +
                          `_Omba admin kwanza kisha jaribu tena._`
                });
                return;
            }

            // ── Execute command ──
            try {
                await cmd.execute(sock, msg, args);
            } catch (execErr) {
                const errMsg = execErr?.message || '';
                if (errMsg.toLowerCase().includes('admin')) {
                    await sock.sendMessage(OWNER_JID, {
                        text: `⚠️ *${pfx}${cmdName}* imeshindwa:\n${errMsg}`
                    });
                } else {
                    console.error(`❌ Command ${cmdName} error:`, errMsg);
                }
            }
            return;
        }

        // ────────────────────────────────────────────────
        //   ROUTING: DM
        //   (isDM && isFromMe imeshashughulikiwa juu → return)
        //   Hapa: DM kutoka mtu yeyote (owner DM au mtu mwingine)
        // ────────────────────────────────────────────────
        if (!hasPrefix && !isReplyToBot) return;

        const match   = text.trim().match(prefixRegex);
        const cmdName = match ? match[1].toLowerCase() : 'ai';
        const args    = match
            ? text.trim().slice(match[0].length).trim().split(/\s+/)
            : text.trim().split(/\s+/);

        const cmd = getCommand(cmdName);
        if (!cmd) {
            await sock.sendMessage(chatJid, {
                text: `❓ Command *${pfx}${cmdName}* haipatikani.\nTumia *${pfx}help* kuona commands zote.`
            }, { quoted: msg });
            return;
        }

        await cmd.execute(sock, msg, args);

    } catch (err) {
        console.error('❌ handleMessage error:', err.message || err);
    }
}

// ════════════════════════════════════════════════
//   CONTACT LISTENER
// ════════════════════════════════════════════════
export function setupContactListener(sock) {
    if (!sock?.ev) return;
    const contactCache = new Map();

    sock.ev.on('contacts.update', (contacts) => {
        if (!Array.isArray(contacts)) return;
        for (const c of contacts) {
            if (!c.id) continue;
            contactCache.set(c.id, {
                name:         c.notify || c.name || '',
                verifiedName: c.verifiedName || '',
                imgUrl:       c.imgUrl || null,
                jid:          c.jid    || null,
                updatedAt:    Date.now()
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

// ════════════════════════════════════════════════════════════════
//
//   🛡️ ANTI-DELETE
//
//   Cache messages ZOTE:
//   - Messages za DM za owner (sent + received)
//   - Messages ZOTE za groups
//   Ikifutwa → inatumwa kwa owner DM
//   FIX #7 — TTL ya dakika 30 imewekwa
//
// ════════════════════════════════════════════════════════════════
const messageCache = new Map();
const MAX_CACHE    = 1000;
const CACHE_TTL_MS = 30 * 60 * 1000; // dakika 30

// Futa messages za zamani kila dakika 5
setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of messageCache.entries()) {
        if (now - entry.timestamp > CACHE_TTL_MS) {
            messageCache.delete(id);
        }
    }
}, 5 * 60 * 1000);

export function setupAntiDelete(sock) {

    // ── Cache messages ──
    sock.ev.on('messages.upsert', ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (!msg.message) continue;

            const chatJid     = msg.key.remoteJid;
            const isGroupChat = chatJid?.endsWith('@g.us');
            const sender      = normalizeJid(msg.key.participant || chatJid);

            const isOwnerDM = !isGroupChat && (
                normalizeJid(chatJid) === normalizeJid(OWNER_JID) || msg.key.fromMe
            );

            // Cache: DM za owner ZOTE + messages zote za group
            if (isOwnerDM || isGroupChat) {
                if (messageCache.size >= MAX_CACHE) {
                    // Futa entry ya kwanza (oldest)
                    const firstKey = messageCache.keys().next().value;
                    messageCache.delete(firstKey);
                }
                messageCache.set(msg.key.id, {
                    msg,
                    chatJid,
                    sender,
                    timestamp: Date.now()
                });
            }
        }
    });

    // ── Detect message iliyofutwa ──
    sock.ev.on('messages.delete', async (item) => {
        try {
            const keys = item.keys ||
                (item.ids?.map(id => ({ id, remoteJid: item.jid }))) || [];

            for (const key of keys) {
                const cached = messageCache.get(key.id);
                if (!cached) continue;

                const { msg, chatJid, sender } = cached;
                messageCache.delete(key.id);

                const text =
                    msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    msg.message?.imageMessage?.caption     ||
                    msg.message?.videoMessage?.caption     || '';

                const senderNum = sender
                    .replace('@s.whatsapp.net', '')
                    .replace('@c.us', '');

                const chatLabel = chatJid.endsWith('@g.us')
                    ? `Group: ${chatJid}`
                    : `DM: +${senderNum}`;

                let notifText  = `🗑️ *Anti-Delete Alert*\n\n`;
                notifText     += `📍 *Kutoka:* ${chatLabel}\n`;
                notifText     += `👤 *Sender:* +${senderNum}\n`;
                notifText     += `🕐 *Wakati:* ${new Date().toLocaleTimeString('sw-TZ')}\n\n`;
                notifText     += text
                    ? `💬 *Ujumbe:* ${text}`
                    : `📎 *[Media au ujumbe wa aina nyingine]*`;

                await sock.sendMessage(OWNER_JID, { text: notifText });

                // ── Jaribu tuma media pia ──
                const imageMsg   = msg.message?.imageMessage;
                const videoMsg   = msg.message?.videoMessage;
                const audioMsg   = msg.message?.audioMessage;
                const stickerMsg = msg.message?.stickerMessage;

                if (imageMsg || videoMsg || audioMsg || stickerMsg) {
                    try {
                        const mediaType    = imageMsg ? 'image' : videoMsg ? 'video' : audioMsg ? 'audio' : 'sticker';
                        const mediaMessage = imageMsg || videoMsg || audioMsg || stickerMsg;
                        const stream       = await downloadContentFromMessage(mediaMessage, mediaType);
                        let   buffer       = Buffer.from([]);
                        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                        const sendPayload = imageMsg
                            ? { image:   buffer, caption: text || '🖼️ [Picha iliyofutwa]' }
                            : videoMsg
                            ? { video:   buffer, caption: text || '🎥 [Video iliyofutwa]' }
                            : audioMsg
                            ? { audio:   buffer, mimetype: 'audio/mp4' }
                            : { sticker: buffer };

                        await sock.sendMessage(OWNER_JID, sendPayload);
                    } catch (mediaErr) {
                        console.error('Anti-delete media error:', mediaErr.message);
                    }
                }
            }
        } catch (err) {
            console.error('Anti-delete error:', err.message);
        }
    });

    console.log('🛡️ Anti-Delete: Imewashwa (Groups + DM) — TTL: 30min');
}

// ════════════════════════════════════════════════════════════════
//
//   👁️ ANTI-VIEW-ONCE
//   View once messages (picha/video/voice) zinatumwa kwa owner DM
//
// ════════════════════════════════════════════════════════════════
export function setupAntiViewOnce(sock) {
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (!msg.message) continue;
            if (msg.key.fromMe) continue;

            const chatJid = msg.key.remoteJid;

            const viewOnceMsg =
                msg.message?.viewOnceMessage?.message            ||
                msg.message?.viewOnceMessageV2?.message          ||
                msg.message?.viewOnceMessageV2Extension?.message;

            if (!viewOnceMsg) continue;

            const imageMsg = viewOnceMsg.imageMessage;
            const videoMsg = viewOnceMsg.videoMessage;
            const audioMsg = viewOnceMsg.audioMessage;

            if (!imageMsg && !videoMsg && !audioMsg) continue;

            try {
                const mediaType    = imageMsg ? 'image' : videoMsg ? 'video' : 'audio';
                const mediaMessage = imageMsg || videoMsg || audioMsg;

                const stream = await downloadContentFromMessage(mediaMessage, mediaType);
                let   buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                const senderNum = normalizeJid(msg.key.participant || chatJid)
                    .replace('@s.whatsapp.net', '')
                    .replace('@c.us', '');

                const chatLabel = chatJid.endsWith('@g.us') ? 'Group' : 'DM';

                let caption  = `👁️ *Anti-View-Once*\n\n`;
                caption     += `📍 *Source:* ${chatLabel}\n`;
                caption     += `👤 *Sender:* +${senderNum}\n`;
                caption     += `📁 *Type:* ${mediaType}\n`;
                caption     += `🕐 *Wakati:* ${new Date().toLocaleTimeString('sw-TZ')}`;

                const sendPayload = imageMsg
                    ? { image: buffer, caption }
                    : videoMsg
                    ? { video: buffer, caption }
                    : { audio: buffer, mimetype: 'audio/mp4' };

                await sock.sendMessage(OWNER_JID, sendPayload);
                console.log(`👁️ View-once ${mediaType} kutoka +${senderNum} → owner`);

            } catch (err) {
                console.error('Anti-view-once error:', err.message);
            }
        }
    });

    console.log('👁️ Anti-View-Once: Imewashwa');
}

// ════════════════════════════════════════════════════════════════
//
//   📊 AUTO STATUS VIEWER
//
//   FIX #4 — HAITUMI FORWARD kwa owner
//   Inafanya tu:
//     1. Mark status kama imeonekana (readMessages)
//     2. React na random emoji
//
// ════════════════════════════════════════════════════════════════
const STATUS_REACTIONS = ['❤️', '🔥', '👍', '😍', '🥰', '💯', '😊', '✨'];

function randomReaction() {
    return STATUS_REACTIONS[Math.floor(Math.random() * STATUS_REACTIONS.length)];
}

export function setupAutoStatusViewer(sock) {

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        // Kubali 'notify' na 'append' — status zinakuja zote mbili
        if (type !== 'notify' && type !== 'append') return;

        for (const msg of messages) {
            if (!msg.message) continue;
            if (msg.key.remoteJid !== 'status@broadcast') continue;
            if (msg.key.fromMe) continue;

            const poster    = normalizeJid(msg.key.participant || msg.key.remoteJid || '');
            const posterNum = poster
                .replace('@s.whatsapp.net', '')
                .replace('@c.us', '');

            // 1. ── Mark status kama imeonekana ──
            try {
                await sock.readMessages([msg.key]);
            } catch {}

            // 2. ── React kwa status (kwa mtu aliyeweka status — si owner) ──
            try {
                const reaction = randomReaction();
                await sock.sendMessage('status@broadcast', {
                    react: {
                        text: reaction,
                        key:  msg.key
                    }
                });
                console.log(`📊 Status ya +${posterNum} → imeona + reacted ${reaction}`);
            } catch (reactErr) {
                console.error(`Status react error (+${posterNum}):`, reactErr.message);
            }

            // ── FIX #4: HAKUNA forward kwa owner ──
            // Status inaonekana na ku-reacted — hiyo inatosha
        }
    });

    console.log('📊 Auto Status Viewer: Imewashwa (view + react TU — hakuna forward)');
}
