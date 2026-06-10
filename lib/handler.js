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
const __dirname  = path.dirname(__filename);

// ════════════════════════════════════════════════
//   OWNER CHECK REMOVED – now uses global.isOwner from index.js
// ════════════════════════════════════════════════

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

function registerCommand(cmd) {
    if (!cmd?.name || typeof cmd.execute !== 'function') return;

    const key = cmd.name.toLowerCase();
    commands.set(key, cmd);

    if (Array.isArray(cmd.alias)) {
        cmd.alias.forEach(a => {
            if (a) commands.set(a.toLowerCase(), cmd);
        });
    }

    global.allCommands.set(key, {
        name:  cmd.name,
        info:  cmd.description || cmd.desc || cmd.info || 'Hakuna maelezo',
        use:   cmd.use || '',
        type:  cmd.category || cmd.type || 'general',
        alias: cmd.alias || [],
        style: 'execute'
    });

    console.log(`✅ Command loaded: ${cmd.name}`);
}

export async function loadCommands() {
    commands.clear();
    global.allCommands.clear();

    const commandsPath = path.join(__dirname, '../commands');

    if (fs.existsSync(commandsPath)) {
        const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

        for (const file of files) {
            try {
                const cmdPath = `file://${path.join(commandsPath, file)}?t=${Date.now()}`;
                const module  = await import(cmdPath);

                // ── STRATEGY 1: Single command export
                if (module.name && typeof module.execute === 'function') {
                    registerCommand({
                        name:        module.name,
                        execute:     module.execute,
                        description: module.description || '',
                        category:    module.category || 'general',
                        use:         module.use || '',
                        alias:       module.alias || [],
                        adminOnly:   module.adminOnly || false,
                    });
                    continue;
                }

                // ── STRATEGY 2: Named exports
                let namedLoaded = 0;
                for (const [exportKey, exportVal] of Object.entries(module)) {
                    if (exportKey === 'default') continue;
                    if (exportVal?.name && typeof exportVal.execute === 'function') {
                        registerCommand(exportVal);
                        namedLoaded++;
                    }
                }
                if (namedLoaded > 0) continue;

                // ── STRATEGY 3: Default export
                const def = module.default;
                if (def) {
                    if (def.name && typeof def.execute === 'function') {
                        registerCommand(def);
                        continue;
                    }
                    if (typeof def === 'object') {
                        for (const val of Object.values(def)) {
                            if (val?.name && typeof val.execute === 'function') {
                                registerCommand(val);
                            }
                        }
                    }
                }

                console.log(`📦 Plugin loaded: ${file}`);

            } catch (err) {
                console.error(`❌ Failed to load ${file}:`, err.message);
            }
        }
    }

    // ── Plugin commands kutoka plugins.js ──
    try {
        const { commands: pluginCommands } = await import('./plugins.js');
        for (const [key, cmd] of pluginCommands.entries()) {
            const commandName = (cmd.cmdname || cmd.pattern || key).toLowerCase();
            const executeFunc = cmd.handler || cmd.execute || cmd.func || (async () => {});

            commands.set(commandName, {
                name:        commandName,
                execute:     executeFunc,
                description: cmd.info || cmd.desc || cmd.description || 'Hakuna maelezo',
                use:         cmd.use || '',
                category:    cmd.type || cmd.category || 'general',
                alias:       cmd.alias || [],
                adminOnly:   cmd.adminOnly || cmd.type === 'admin' || false,
            });

            global.allCommands.set(commandName, {
                name:  commandName,
                info:  cmd.info || cmd.desc || cmd.description || 'Hakuna maelezo',
                use:   cmd.use || '',
                type:  cmd.type || cmd.category || 'general',
                alias: cmd.alias || [],
                style: 'plugin'
            });
        }
        console.log(`✅ Plugin commands: ${pluginCommands.size} loaded`);
    } catch (err) {
        console.error('❌ Plugin load error:', err.message);
    }

    console.log(`\n📋 Commands zote: ${commands.size} | allCommands: ${global.allCommands.size}\n`);
}

export function getCommand(name) {
    return commands.get(name?.toLowerCase());
}

// ════════════════════════════════════════════════
//   HELPERS
// ════════════════════════════════════════════════
function normalizeJid(jid) {
    if (!jid) return '';
    return jid.replace(/:\d+@/, '@');
}

// Owner check now uses global.isOwner from index.js – no custom function here

// ════════════════════════════════════════════════════════════════
//   📨 MAIN MESSAGE HANDLER
// ════════════════════════════════════════════════════════════════
export async function handleMessage(sock, msg) {
    try {
        setSck(sock);

        const chatJid  = msg.key.remoteJid;
        const isGroup  = chatJid?.endsWith('@g.us');
        const isDM     = !isGroup;
        const isFromMe = msg.key.fromMe === true;

        const rawSender = isGroup ? (msg.key.participant || '') : chatJid;
        const senderJid = normalizeJid(rawSender);

        const isActualOwner = global.isOwner(senderJid, sock, msg);

        const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption ||
            '';

        if (!text?.trim()) return;

        const pfx        = global.prefix || prefix || '.';
        const pfxEscaped = pfx.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const prefixRegex = new RegExp(`^${pfxEscaped}([\\w]+)`, 'i');
        const hasPrefix   = prefixRegex.test(text.trim());

        // ── FIX: DM kutoka own number — ruhusia commands, zuia ujumbe wa kawaida ──
        if (isDM && isFromMe && !hasPrefix) return;

        // Reply detection
        const contextInfo       = msg.message?.extendedTextMessage?.contextInfo;
        const quotedStanzaId    = contextInfo?.stanzaId    || '';
        const quotedParticipant = contextInfo?.participant || '';

        const botId        = sock.user?.id  || '';
        const botLid       = sock.user?.lid || '';
        const botNumber    = botId.replace(/:.*@/, '').replace(/@.*/, '');
        const botLidNumber = botLid.replace(/:.*@/, '').replace(/@.*/, '');

        const isReplyToBot = Boolean(
            (isDM && !!quotedStanzaId) ||
            (botNumber    && quotedParticipant?.includes(botNumber))    ||
            (botLidNumber && quotedParticipant?.includes(botLidNumber))
        );

        // ────────────────────────────────────────────────
        //   ROUTING: GROUP
        // ────────────────────────────────────────────────
        if (isGroup) {

            let senderIsGroupAdmin = false;
            try {
                const meta        = await sock.groupMetadata(chatJid);
                const participant = meta.participants.find(
                    p => normalizeJid(p.id) === normalizeJid(senderJid)
                );
                senderIsGroupAdmin =
                    participant?.admin === 'admin' ||
                    participant?.admin === 'superadmin';
            } catch {}

            const canUseCommands = isActualOwner || senderIsGroupAdmin;

            if (!canUseCommands) {
                const isAiCommand = /^\.(ai|bot|photo)\s*/i.test(text.trim()) || isReplyToBot;
                if (!isAiCommand) return;

                const aiCmd = getCommand('ai');
                if (aiCmd) await aiCmd.execute(sock, msg, text.trim().split(/\s+/));
                return;
            }

            if (!hasPrefix && !isReplyToBot) return;

            const match   = text.trim().match(prefixRegex);
            const cmdName = match ? match[1].toLowerCase() : (isReplyToBot ? 'ai' : null);
            if (!cmdName) return;

            const args = match
                ? text.trim().slice(match[0].length).trim().split(/\s+/)
                : text.trim().split(/\s+/);

            const cmd = getCommand(cmdName);
            if (!cmd) {
                await sock.sendMessage(chatJid, {
                    text: `❓ Command *${pfx}${cmdName}* haipatikani.\nTumia *${pfx}help* kuona commands zote.`
                });
                return;
            }

            try {
                await cmd.execute(sock, msg, args);
            } catch (execErr) {
                const errMsg = execErr?.message || '';
                if (
                    errMsg.toLowerCase().includes('admin') ||
                    errMsg.toLowerCase().includes('forbidden') ||
                    errMsg.toLowerCase().includes('not-authorized')
                ) {
                    await sock.sendMessage(chatJid, {
                        text: `⚠️ *${pfx}${cmdName}* imeshindwa:\n\n` +
                              `_Bot si admin kwenye group hiyo._\n` +
                              `_Fanya bot admin kisha jaribu tena._`
                    });
                } else {
                    console.error(`❌ Command ${cmdName} error:`, errMsg);
                }
            }
            return;
        }

        // ────────────────────────────────────────────────
        //   ROUTING: DM – Owner only
        // ────────────────────────────────────────────────
        if (!hasPrefix && !isReplyToBot) return;

        // 🔒 OWNER GUARD FOR DM COMMANDS
        if (!isActualOwner) {
            await sock.sendMessage(chatJid, { text: tlang().owner });
            return;
        }

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
        } catch { return null; }
    };
}

// ════════════════════════════════════════════════
//   🛡️ ANTI-DELETE
// ════════════════════════════════════════════════
const messageCache = new Map();
const MAX_CACHE    = 1000;

export function setupAntiDelete(sock) {

    sock.ev.on('messages.upsert', ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (!msg.message) continue;

            const chatJid     = msg.key.remoteJid;
            const isGroupChat = chatJid?.endsWith('@g.us');
            const sender      = normalizeJid(msg.key.participant || chatJid);

            // Owner JID is now dynamic – but we still want to capture all messages
            // We'll store anyway, anti-delete will send to owner later
            if (messageCache.size >= MAX_CACHE) {
                const firstKey = messageCache.keys().next().value;
                messageCache.delete(firstKey);
            }
            messageCache.set(msg.key.id, { msg, chatJid, sender, timestamp: Date.now() });
        }
    });

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
                    msg.message?.imageMessage?.caption ||
                    msg.message?.videoMessage?.caption || '';

                const senderNum = sender.replace('@s.whatsapp.net', '').replace('@c.us', '');
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

                // Send to owner – we need a valid owner JID. Use the first from global.isOwner detection?
                // We'll send to the bot's own number (sock.user.id) which is the owner.
                const ownerJid = sock.user?.id;
                if (ownerJid) await sock.sendMessage(ownerJid, { text: notifText });

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
                            ? { image: buffer,   caption: text || '🖼️ [Picha iliyofutwa]' }
                            : videoMsg
                            ? { video: buffer,   caption: text || '🎥 [Video iliyofutwa]' }
                            : audioMsg
                            ? { audio: buffer,   mimetype: 'audio/mp4' }
                            : { sticker: buffer };

                        if (ownerJid) await sock.sendMessage(ownerJid, sendPayload);
                    } catch (mediaErr) {
                        console.error('Anti-delete media error:', mediaErr.message);
                    }
                }
            }
        } catch (err) {
            console.error('Anti-delete error:', err.message);
        }
    });

    console.log('🛡️ Anti-Delete: Imewashwa (Groups + DM)');
}

// ════════════════════════════════════════════════
//   👁️ ANTI-VIEW-ONCE
// ════════════════════════════════════════════════
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
                    .replace('@s.whatsapp.net', '').replace('@c.us', '');

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

                const ownerJid = sock.user?.id;
                if (ownerJid) await sock.sendMessage(ownerJid, sendPayload);
                console.log(`👁️ View-once ${mediaType} kutoka +${senderNum} → owner`);

            } catch (err) {
                console.error('Anti-view-once error:', err.message);
            }
        }
    });

    console.log('👁️ Anti-View-Once: Imewashwa');
}

// ════════════════════════════════════════════════
//   📊 AUTO STATUS VIEWER
// ════════════════════════════════════════════════
const STATUS_REACTIONS = ['❤️', '🔥', '👍', '😍', '🥰', '💯', '😊', '✨'];

function randomReaction() {
    return STATUS_REACTIONS[Math.floor(Math.random() * STATUS_REACTIONS.length)];
}

export function setupAutoStatusViewer(sock) {
    sock.ev.on('messages.upsert', async ({ messages, type }) => {

        if (type !== 'notify' && type !== 'append') return;

        for (const msg of messages) {
            if (!msg.message) continue;
            if (msg.key.remoteJid !== 'status@broadcast') continue;
            if (msg.key.fromMe) continue;

            const poster    = normalizeJid(msg.key.participant || msg.key.remoteJid || '');
            const posterNum = poster.replace('@s.whatsapp.net', '').replace('@c.us', '');

            try {
                await sock.readMessages([msg.key]);
            } catch {}

            try {
                const reaction = randomReaction();
                await sock.sendMessage('status@broadcast', {
                    react: { text: reaction, key: msg.key }
                });
                console.log(`📊 Status +${posterNum} → viewed ✅ reacted ${reaction}`);
            } catch (err) {
                console.error(`Status react error (+${posterNum}):`, err.message);
            }
        }
    });

    console.log('📊 Auto Status Viewer: Imewashwa (view + react only)');
}
