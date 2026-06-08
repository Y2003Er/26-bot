import fs from 'fs';
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
const __dirname = path.dirname(__filename);

// ════════════════════════════════════════════════
//   OWNER NUMBER — soma kutoka .env (recommended)
//   Format: namba tu bila + wala @, mfano: 255753495142
// ════════════════════════════════════════════════
const RAW_OWNER = (process.env.OWNER_NUMBER || '255753495142').replace(/[^0-9]/g, '');
const OWNER_JID = `${RAW_OWNER}@s.whatsapp.net`;

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
export const sck = () => _sck;
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
                // Force fresh import kila wakati (avoid cache)
                const module = await import(`file://${cmdPath}?t=${Date.now()}`);
                const cmd = module.default || module;

                if (cmd.name && typeof cmd.execute === 'function') {
                    commands.set(cmd.name.toLowerCase(), cmd);
                    // Alias zote pia
                    if (Array.isArray(cmd.alias)) {
                        cmd.alias.forEach(a => commands.set(a.toLowerCase(), cmd));
                    }
                    global.allCommands.set(cmd.name.toLowerCase(), {
                        name: cmd.name,
                        info: cmd.description || 'Hakuna maelezo',
                        use: cmd.use || '',
                        type: cmd.category || cmd.type || 'general',
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
        const { commands: pluginCommands } = await import('./plugins.js');
        for (const [key, cmd] of pluginCommands.entries()) {
            const commandName = (cmd.cmdname || cmd.pattern || key).toLowerCase();
            const executeFunc = cmd.handler || cmd.execute || cmd.func || (async () => {});
            commands.set(commandName, {
                name: commandName,
                execute: executeFunc,
                description: cmd.info || cmd.desc || cmd.description || 'Hakuna maelezo',
                use: cmd.use || '',
                category: cmd.type || cmd.category || 'general',
                alias: cmd.alias || []
            });
            global.allCommands.set(commandName, {
                name: commandName,
                info: cmd.info || cmd.desc || cmd.description || 'Hakuna maelezo',
                use: cmd.use || '',
                type: cmd.type || cmd.category || 'general',
                alias: cmd.alias || [],
                style: 'plugin'
            });
        }
    } catch (err) {
        console.error('❌ Plugin load error:', err.message);
    }
}

function getCommand(name) {
    return commands.get(name?.toLowerCase());
}

// ════════════════════════════════════════════════════════════════
//
//   🔑 HELPER: Normalize JID — ondoa device suffix (:X@...)
//   Baileys inaweza kutuma "255753495142:5@s.whatsapp.net"
//   Tunabidi tulinganishe na "255753495142@s.whatsapp.net"
//
// ════════════════════════════════════════════════════════════════
function normalizeJid(jid) {
    if (!jid) return '';
    // Ondoa device suffix: 255xxx:5@s.whatsapp.net → 255xxx@s.whatsapp.net
    return jid.replace(/:\d+@/, '@');
}

function isOwnerJid(jid) {
    return normalizeJid(jid) === normalizeJid(OWNER_JID);
}

// ════════════════════════════════════════════════════════════════
//
//   📨 MAIN MESSAGE HANDLER
//
//   ROUTING LOGIC:
//   ┌─────────────────────────────────────────────────────────┐
//   │ DM kutoka watu wengine  → commands za DM zinafanya kazi │
//   │ DM kutoka own number    → IGNORE (bot hajibu nafsi yake)│
//   │                                                         │
//   │ Group — own number + admin    → commands zote ✅        │
//   │ Group — own number bila admin → execute cmd, kama cmd   │
//   │         inahitaji admin → jibu kwa owner DM (si group)  │
//   │ Group — watu wengine    → IGNORE isipokuwa .ai/.bot     │
//   └─────────────────────────────────────────────────────────┘
//
// ════════════════════════════════════════════════════════════════
export async function handleMessage(sock, msg) {
    try {
        setSck(sock);

        const chatJid   = msg.key.remoteJid;
        const isGroup   = chatJid?.endsWith('@g.us');
        const isDM      = !isGroup;
        const isFromMe  = msg.key.fromMe === true;

        // Sender: kwenye group ni participant, kwenye DM ni chatJid yenyewe
        const rawSender = isGroup
            ? (msg.key.participant || '')
            : chatJid;

        const senderJid = normalizeJid(rawSender);
        const isOwner   = isOwnerJid(senderJid) || (isFromMe && isDM === false ? false : isFromMe);

        // ── Kama ni DM kutoka own number (bot ikijiandikia) → IGNORE ──
        if (isDM && isFromMe) return;

        // ── Kama ni DM kutoka own number kama mtu (own number = OWNER_JID) ──
        // Hii inashughulikiwa chini — owner DM anaruhusiwa

        // Pata text ya ujumbe
        const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption ||
            '';

        if (!text?.trim()) return;

        const pfx = global.prefix || prefix || '.';
        const pfxEscaped = pfx.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const prefixRegex = new RegExp(`^${pfxEscaped}([\\w]+)`, 'i');
        const hasPrefix   = prefixRegex.test(text.trim());

        // ── Reply detection ──
        const contextInfo      = msg.message?.extendedTextMessage?.contextInfo;
        const quotedStanzaId   = contextInfo?.stanzaId || '';
        const quotedParticipant = contextInfo?.participant || '';

        const botId        = sock.user?.id || '';
        const botLid       = sock.user?.lid || '';
        const botNumber    = botId.replace(/:.*@/, '').replace(/@.*/, '');
        const botLidNumber = botLid.replace(/:.*@/, '').replace(/@.*/, '');

        const isReplyToBot = Boolean(
            (isDM && !!quotedStanzaId) ||
            (botNumber && quotedParticipant?.includes(botNumber)) ||
            (botLidNumber && quotedParticipant?.includes(botLidNumber))
        );

        // ────────────────────────────────────────────────
        //   ROUTING: GROUP
        // ────────────────────────────────────────────────
        if (isGroup) {
            const isActualOwner = isOwnerJid(senderJid);

            // Watu wengine kwenye group: ruhusiwa .ai/.bot TU
            if (!isActualOwner) {
                const isAiCommand = /^\.(ai|bot)\s*/i.test(text.trim()) || isReplyToBot;
                if (!isAiCommand) return; // Ignore kabisa

                // Peleka kwa ai command moja kwa moja
                const aiCmd = getCommand('ai');
                if (aiCmd) {
                    await aiCmd.execute(sock, msg, text.trim().split(/\s+/));
                }
                return;
            }

            // ── Owner kwenye group ──
            if (!hasPrefix && !isReplyToBot) return;

            // Pata jina la command
            const match   = text.trim().match(prefixRegex);
            const cmdName = match ? match[1].toLowerCase() : (isReplyToBot ? 'ai' : null);
            if (!cmdName) return;

            const args = match
                ? text.trim().slice(match[0].length).trim().split(/\s+/)
                : text.trim().split(/\s+/);

            const cmd = getCommand(cmdName);
            if (!cmd) return;

            // Angalia kama command inahitaji admin
            const needsAdmin = cmd.adminOnly === true ||
                               cmd.category === 'admin' ||
                               cmd.type === 'admin';

            // Pata group metadata kujua kama owner ni admin
            let ownerIsAdmin = false;
            try {
                const meta = await sock.groupMetadata(chatJid);
                const participant = meta.participants.find(
                    p => normalizeJid(p.id) === normalizeJid(senderJid)
                );
                ownerIsAdmin = participant?.admin === 'admin' ||
                               participant?.admin === 'superadmin';
            } catch {}

            if (needsAdmin && !ownerIsAdmin) {
                // Owner hana admin — jibu kwa DM badala ya group
                await sock.sendMessage(OWNER_JID, {
                    text: `⚠️ *Command inahitaji admin*\n\nUlijaribu: *${pfx}${cmdName}* kwenye group\nLakini huna admin privileges hapo.\n\n_Omba admin kwanza kisha jaribu tena._`
                });
                return;
            }

            // Execute command — kama imetoa error ya admin, peleka DM
            try {
                await cmd.execute(sock, msg, args);
            } catch (execErr) {
                const errMsg = execErr?.message || '';
                if (errMsg.toLowerCase().includes('admin')) {
                    await sock.sendMessage(OWNER_JID, {
                        text: `⚠️ *${pfx}${cmdName}* imeshindwa:\n${errMsg}`
                    });
                } else {
                    throw execErr;
                }
            }
            return;
        }

        // ────────────────────────────────────────────────
        //   ROUTING: DM
        // ────────────────────────────────────────────────
        // (isFromMe + DM imeshashughulikiwa juu — return)
        // Hapa: DM kutoka mtu yeyote (pamoja na owner akituma kwa bot)

        if (!hasPrefix && !isReplyToBot) return;

        const match   = text.trim().match(prefixRegex);
        const cmdName = match ? match[1].toLowerCase() : 'ai';
        const args    = match
            ? text.trim().slice(match[0].length).trim().split(/\s+/)
            : text.trim().split(/\s+/);

        const cmd = getCommand(cmdName);
        if (!cmd) {
            // Command haipo — taarisha
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

// ════════════════════════════════════════════════════════════════
//
//   🛡️ ANTI-DELETE
//   Inahifadhi messages za owner (zilizotumwa KWA owner au NA owner)
//   Ikifutwa → inatumwa tena kwa owner DM
//
// ════════════════════════════════════════════════════════════════
const messageCache = new Map(); // key: messageId, value: { msg, from }
const MAX_CACHE = 500;

export function setupAntiDelete(sock) {
    // Hifadhi messages zinazoingia (za owner tu au DM za owner)
    sock.ev.on('messages.upsert', ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
            if (!msg.message) continue;
            const chatJid  = msg.key.remoteJid;
            const sender   = normalizeJid(msg.key.participant || chatJid);
            const isForOwner = normalizeJid(chatJid) === normalizeJid(OWNER_JID);
            const isFromOwner = isOwnerJid(sender) || msg.key.fromMe;

            // Cache messages za owner (sent na received)
            if (isForOwner || isFromOwner) {
                if (messageCache.size >= MAX_CACHE) {
                    // Futa ya zamani zaidi
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

    // Detect message iliyofutwa
    sock.ev.on('messages.delete', async (item) => {
        try {
            // item inaweza kuwa { keys: [...] } au { jid, ids: [...] }
            const keys = item.keys || (item.ids?.map(id => ({ id, remoteJid: item.jid }))) || [];

            for (const key of keys) {
                const cached = messageCache.get(key.id);
                if (!cached) continue;

                const { msg, chatJid, sender } = cached;
                messageCache.delete(key.id);

                // Pata content ya message iliyofutwa
                const text =
                    msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    msg.message?.imageMessage?.caption ||
                    msg.message?.videoMessage?.caption ||
                    '';

                const senderNum = sender.replace('@s.whatsapp.net', '').replace('@c.us', '');
                const chatLabel = chatJid.endsWith('@g.us')
                    ? `Group: ${chatJid}`
                    : `DM: ${senderNum}`;

                let notifText = `🗑️ *Anti-Delete Alert*\n\n`;
                notifText += `📍 *Kutoka:* ${chatLabel}\n`;
                notifText += `👤 *Sender:* +${senderNum}\n`;
                notifText += `🕐 *Wakati:* ${new Date().toLocaleTimeString('sw-TZ')}\n\n`;

                if (text) {
                    notifText += `💬 *Ujumbe:* ${text}`;
                } else {
                    notifText += `📎 *[Media au ujumbe wa aina nyingine]*`;
                }

                // Tuma kwa owner DM
                await sock.sendMessage(OWNER_JID, { text: notifText });

                // Kama ilikuwa media, jaribu itume tena
                const imageMsg = msg.message?.imageMessage;
                const videoMsg = msg.message?.videoMessage;
                const audioMsg = msg.message?.audioMessage;
                const stickerMsg = msg.message?.stickerMessage;

                if (imageMsg || videoMsg || audioMsg || stickerMsg) {
                    try {
                        const mediaType = imageMsg ? 'image' : videoMsg ? 'video' : audioMsg ? 'audio' : 'sticker';
                        const mediaMessage = imageMsg || videoMsg || audioMsg || stickerMsg;
                        const stream = await downloadContentFromMessage(mediaMessage, mediaType);
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                        const sendPayload = imageMsg
                            ? { image: buffer, caption: text || '🖼️ [Picha iliyofutwa]' }
                            : videoMsg
                            ? { video: buffer, caption: text || '🎥 [Video iliyofutwa]' }
                            : audioMsg
                            ? { audio: buffer, mimetype: 'audio/mp4' }
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

    console.log('🛡️ Anti-Delete: Imewashwa');
}

// ════════════════════════════════════════════════════════════════
//
//   👁️ ANTI-VIEW-ONCE
//   View once messages (picha/video/voice) zinatumwa kwa owner DM
//   bila "view once" restriction
//
// ════════════════════════════════════════════════════════════════
export function setupAntiViewOnce(sock) {
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (!msg.message) continue;
            if (msg.key.fromMe) continue;

            const chatJid = msg.key.remoteJid;

            // Angalia kama ni view once
            const viewOnceMsg =
                msg.message?.viewOnceMessage?.message ||
                msg.message?.viewOnceMessageV2?.message ||
                msg.message?.viewOnceMessageV2Extension?.message;

            if (!viewOnceMsg) continue;

            const imageMsg   = viewOnceMsg.imageMessage;
            const videoMsg   = viewOnceMsg.videoMessage;
            const audioMsg   = viewOnceMsg.audioMessage;

            if (!imageMsg && !videoMsg && !audioMsg) continue;

            try {
                const mediaType    = imageMsg ? 'image' : videoMsg ? 'video' : 'audio';
                const mediaMessage = imageMsg || videoMsg || audioMsg;

                const stream = await downloadContentFromMessage(mediaMessage, mediaType);
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                const senderNum = normalizeJid(
                    msg.key.participant || chatJid
                ).replace('@s.whatsapp.net', '').replace('@c.us', '');

                const chatLabel = chatJid.endsWith('@g.us')
                    ? `Group`
                    : `DM`;

                let caption = `👁️ *Anti-View-Once*\n\n`;
                caption += `📍 *Source:* ${chatLabel}\n`;
                caption += `👤 *Sender:* +${senderNum}\n`;
                caption += `📁 *Type:* ${mediaType}\n`;
                caption += `🕐 *Wakati:* ${new Date().toLocaleTimeString('sw-TZ')}`;

                const sendPayload = imageMsg
                    ? { image: buffer, caption }
                    : videoMsg
                    ? { video: buffer, caption }
                    : { audio: buffer, mimetype: 'audio/mp4' };

                await sock.sendMessage(OWNER_JID, sendPayload);
                console.log(`👁️ View-once ${mediaType} kutoka ${senderNum} imepelekwa kwa owner`);

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
//   Inaona status zote za contacts automatically
//   Status za owner zinaonekana — zinatumwa kwa owner DM pia
//
// ════════════════════════════════════════════════════════════════
export function setupAutoStatusViewer(sock) {
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        // Status updates zina type 'append' au remoteJid = 'status@broadcast'
        for (const msg of messages) {
            if (!msg.message) continue;
            if (msg.key.remoteJid !== 'status@broadcast') continue;
            if (msg.key.fromMe) continue;

            const poster = normalizeJid(msg.key.participant || '');

            // 1. Mark status kama imeonekana
            try {
                await sock.readMessages([msg.key]);
            } catch {}

            // 2. Tuma status kwa owner DM (kama inatakiwa)
            try {
                const imageMsg  = msg.message?.imageMessage;
                const videoMsg  = msg.message?.videoMessage;
                const textMsg   = msg.message?.conversation ||
                                  msg.message?.extendedTextMessage?.text;

                const posterNum = poster.replace('@s.whatsapp.net', '').replace('@c.us', '');
                const timeStr   = new Date().toLocaleTimeString('sw-TZ');

                if (textMsg) {
                    await sock.sendMessage(OWNER_JID, {
                        text: `📊 *Status Update*\n\n👤 *+${posterNum}*\n🕐 ${timeStr}\n\n💬 ${textMsg}`
                    });
                } else if (imageMsg || videoMsg) {
                    const mediaType    = imageMsg ? 'image' : 'video';
                    const mediaMessage = imageMsg || videoMsg;
                    const caption      = mediaMessage.caption || '';

                    const stream = await downloadContentFromMessage(mediaMessage, mediaType);
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                    const headerCaption = `📊 *Status Update*\n👤 *+${posterNum}*\n🕐 ${timeStr}${caption ? '\n\n' + caption : ''}`;

                    const sendPayload = imageMsg
                        ? { image: buffer, caption: headerCaption }
                        : { video: buffer, caption: headerCaption };

                    await sock.sendMessage(OWNER_JID, sendPayload);
                }
            } catch (err) {
                // Baadhi ya status haziwezi kudownload — skip silently
                if (!err.message?.includes('not-authorized')) {
                    console.error('Status viewer error:', err.message);
                }
            }
        }
    });

    console.log('📊 Auto Status Viewer: Imewashwa');
}
