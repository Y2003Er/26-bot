import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import NodeCache from 'node-cache';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import {
    prefix as _prefix,
    packname,
    author
} from '../config.js';
import astro_patch from './plugins.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ════════════════
// OWNER NUMBER
// ════════════════
const RAW_OWNER = (process.env.OWNER_NUMBER || '255753495142').replace(/[^0-9]/g, '');
const OWNER_JID = `${RAW_OWNER}@s.whatsapp.net`;

// ════════════════
// GLOBAL TOGGLES
// ════════════════
global.autoStatusLike = process.env.AUTO_STATUS_LIKE === 'true';

// ════════════════
// GLOBAL ERROR HANDLERS
// ════════════════
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err.message);
});

// ════════════════
// EXPORTS ZA KAWAIDA
// ════════════════
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

export const getAdmin = (participants) => {
    if (!Array.isArray(participants)) return [];
    return participants
       .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
       .map(p => p.id);
};

export const parsedJid = (jid) => {
    if (!jid || typeof jid!== 'string') return null;
    return jid.includes(':')? jid.split(':')[0] + '@s.whatsapp.net' : jid;
};

export const send = async (m, text, options = {}, _a = '', _b = '', jid = null) => {
    try {
        const chatId = jid || m.chat;
        return await m.bot.sendMessage(chatId, { text,...options });
    } catch (err) {
        console.error('❌ Send error:', err.message);
        return null;
    }
};

export const smd = astro_patch.smd;

export async function updateProfilePicture(m, jid, mediaMsg, type = 'gpp') {
    try {
        const media = await m.bot.downloadMediaMessage(mediaMsg);
        await m.bot.updateProfilePicture(jid, { img: media });
        return await m.reply('*_✅ Profile picture updated successfully!_*');
    } catch (err) {
        console.error('❌ Update PP error:', err.message);
        return await m.reply('*_❌ Failed to update profile picture!_*');
    }
}

let _sck = null;
export const sck = () => _sck;
export const setSck = (sock) => { _sck = sock; };

const commands = new Map();
global.allCommands = global.allCommands || new Map();
const groupMetaCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
export { groupMetaCache };

function registerCommand(cmd) {
    if (!cmd?.name || typeof cmd.execute!== 'function') return;

    const key = cmd.name.toLowerCase();
    commands.set(key, cmd);

    if (Array.isArray(cmd.alias)) {
        cmd.alias.forEach(a => {
            if (a) commands.set(a.toLowerCase(), cmd);
        });
    }

    global.allCommands.set(key, {
        name: cmd.name,
        info: cmd.description || cmd.desc || cmd.info || 'Hakuna maelezo',
        use: cmd.use || '',
        type: cmd.category || cmd.type || 'general',
        alias: cmd.alias || [],
        style: 'execute',
        ownerOnly: cmd.ownerOnly || false,
        adminOnly: cmd.adminOnly || false
    });
}

export async function loadCommands() {
    commands.clear();
    global.allCommands.clear();
    const commandsPath = path.join(__dirname, '../commands');

    if (fs.existsSync(commandsPath)) {
        const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

        for (const file of files) {
            try {
                const cmdPath = `file://${path.join(commandsPath, file)}`;
                const module = await import(cmdPath);

                if (typeof module.onLoad === 'function') {
                    await module.onLoad();
                    console.log(`⚙️ onLoad() done: ${file}`);
                }

                if (module.name && typeof module.execute === 'function') {
                    registerCommand(module);
                    continue;
                }

                if (module.default) {
                    const def = module.default;
                    if (def.name && typeof def.execute === 'function') {
                        registerCommand(def);
                    } else if (typeof def === 'object') {
                        for (const val of Object.values(def)) {
                            if (val?.name && typeof val.execute === 'function') {
                                registerCommand(val);
                            }
                        }
                    }
                    continue;
                }

                for (const [exportKey, exportVal] of Object.entries(module)) {
                    if (exportKey === 'default') continue;
                    if (exportVal?.name && typeof exportVal.execute === 'function') {
                        registerCommand(exportVal);
                    }
                }
            } catch (err) {
                console.error(`❌ Failed to load ${file}:`, err.message);
            }
        }
    }

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
                alias: cmd.alias || [],
                ownerOnly: cmd.ownerOnly || false,
                adminOnly: cmd.adminOnly || cmd.type === 'admin' || false
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
        console.log(`✅ Plugin commands: ${pluginCommands.size} loaded`);
    } catch (err) {
        console.error('❌ Plugin load error:', err.message);
    }

    console.log(`\n📋 Commands zote: ${commands.size} | allCommands: ${global.allCommands.size}\n`);
}

export function getCommand(name) {
    if (!name) return undefined;
    return commands.get(name.toLowerCase());
}

function normalizeJid(jid) {
    if (!jid) return '';
    return String(jid).replace(/:\d+@/, '@');
}

function isOwnerJid(jid) {
    if (!jid) return false;
    const clean = j => {
        if (!j) return '';
        return String(j).split(':')[0]
           .replace(/@lid|@s\.whatsapp\.net|@c\.us/g, '')
           .replace(/[^0-9]/g, '');
    };
    const senderNum = clean(jid);
    if (!senderNum) return false;
    const ownerNums = (process.env.OWNER_NUMBER || RAW_OWNER).split(',').map(n => clean(n)).filter(Boolean);
    if (ownerNums.includes(senderNum)) return true;
    if (process.env.OWNER_LID) {
        const ownerLids = process.env.OWNER_LID.split(',').map(n => clean(n)).filter(Boolean);
        if (ownerLids.includes(senderNum)) return true;
    }
    if (global.ownerLid && clean(global.ownerLid) === senderNum) return true;
    return false;
}

export async function handleMessage(sock, msg) {
    try {
        setSck(sock);
        const chatJid = msg.key.remoteJid;
        const isGroup = chatJid?.endsWith('@g.us');
        const isDM =!isGroup;
        const isFromMe = msg.key.fromMe === true;
        const rawSender = isGroup? (msg.key.participant || '') : chatJid;
        const senderJid = normalizeJid(rawSender);
        const isActualOwner = isOwnerJid(senderJid) || isFromMe;
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption || '';
        if (!text?.trim()) return;
        const pfx = global.prefix || prefix || '.';
        const pfxEscaped = pfx.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const prefixRegex = new RegExp(`^${pfxEscaped}([\\w]+)`, 'i');
        const hasPrefix = prefixRegex.test(text.trim());
        if (isDM && isFromMe &&!hasPrefix) return;
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        const quotedStanzaId = contextInfo?.stanzaId || '';
        const quotedParticipant = contextInfo?.participant || '';
        const botId = sock.user?.id || '';
        const botLid = sock.user?.lid || '';
        const botNumber = botId.replace(/:.*@/, '').replace(/@.*/, '');
        const botLidNumber = botLid.replace(/:.*@/, '').replace(/@.*/, '');
        const isReplyToBot = Boolean( (isDM &&!!quotedStanzaId) || (botNumber && quotedParticipant?.includes(botNumber)) || (botLidNumber && quotedParticipant?.includes(botLidNumber)) );

        if (isGroup) {
            let senderIsGroupAdmin = false;
            try {
                let meta = groupMetaCache.get(chatJid);
                if (!meta) {
                    meta = await sock.groupMetadata(chatJid);
                    groupMetaCache.set(chatJid, meta);
                }
                const participant = meta.participants.find(p => normalizeJid(p.id) === normalizeJid(senderJid));
                senderIsGroupAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';
            } catch (err) {
                console.error('❌ Group metadata error:', err.message);
            }
            const canUseCommands = isActualOwner || senderIsGroupAdmin;
            if (!canUseCommands) {
                const isAiCommand = /^\.(ai|bot|photo)\s*/i.test(text.trim());
                if (!isAiCommand) return;
                const aiCmd = getCommand('ai');
                if (aiCmd) {
                    try {
                        await aiCmd.execute(sock, msg, text.trim().split(/\s+/));
                    } catch (err) {
                        console.error('❌ AI command error:', err.message);
                    }
                }
                return;
            }
            if (!hasPrefix &&!isReplyToBot) return;
            const match = text.trim().match(prefixRegex);
            const cmdName = match?.[1]?.toLowerCase() || null;
            if (!cmdName) return;
            const args = match? text.trim().slice(match[0].length).trim().split(/\s+/) : text.trim().split(/\s+/);
            const cmd = getCommand(cmdName);
            if (!cmd) {
                await sock.sendMessage(chatJid, { text: `❓ Command *${pfx}${cmdName}* haipatikani.\nTumia *${pfx}help* kuona commands zote.` }, { quoted: msg });
                return;
            }
            if (cmd.ownerOnly &&!isActualOwner) {
                await sock.sendMessage(chatJid, { text: `🔒 *Command hii ni ya Owner peke yake!*` }, { quoted: msg });
                return;
            }
            if (cmd.adminOnly &&!isActualOwner &&!senderIsGroupAdmin) {
                await sock.sendMessage(chatJid, { text: `🛡️ *Command hii inahitaji Admin au Owner!*` }, { quoted: msg });
                return;
            }
            try {
                await cmd.execute(sock, msg, args);
            } catch (execErr) {
                console.error(`❌ Command ${cmdName} error:`, execErr.message);
            }
            return;
        }

        if (!hasPrefix &&!isReplyToBot) return;
        const match = text.trim().match(prefixRegex);
        const cmdName = match?.[1]?.toLowerCase() || null;
        if (!cmdName) return;
        const args = match? text.trim().slice(match[0].length).trim().split(/\s+/) : text.trim().split(/\s+/);
        const cmd = getCommand(cmdName);
        if (!cmd) {
            await sock.sendMessage(chatJid, { text: `❓ Command *${pfx}${cmdName}* haipatikani.\nTumia *${pfx}help* kuona commands zote.` }, { quoted: msg });
            return;
        }
        if (cmd.ownerOnly &&!isActualOwner) {
            await sock.sendMessage(chatJid, { text: `🔒 *Command hii ni ya Owner peke yake!*` }, { quoted: msg });
            return;
        }
        try {
            await cmd.execute(sock, msg, args);
        } catch (execErr) {
            console.error(`❌ Command ${cmdName} error:`, execErr.message);
        }
    } catch (err) {
        console.error('❌ handleMessage error:', err.message || err);
    }
}

const contactCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });
export function setupContactListener(sock) {
    if (!sock?.ev) return;
    sock.ev.on('contacts.update', (contacts) => {
        if (!Array.isArray(contacts)) return;
        for (const c of contacts) {
            if (!c.id) continue;
            contactCache.set(c.id, {
                name: c.notify || c.name || '',
                verifiedName: c.verifiedName || '',
                updatedAt: Date.now()
            });
        }
    });
    global.contactCache = contactCache;
    global.getPhoneNumberFromLid = async (sock, lid) => {
        try {
            const info = await sock.getLid(lid);
            return info?.jid || null;
        } catch (err) {
            console.error('❌ getLid error:', err.message);
            return null;
        }
    };
}

const messageCache = new NodeCache({ stdTTL: 3600, checkperiod: 600, maxKeys: 200 });
async function downloadMediaSafe(mediaMessage, mediaType) {
    let stream;
    try {
        stream = await downloadContentFromMessage(mediaMessage, mediaType);
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    } catch (err) {
        console.error('❌ Media download error:', err.message);
        return null;
    } finally {
        if (stream?.destroy) {
            stream.destroy();
        }
    }
}

export function setupAntiDelete(sock) {
    sock.ev.on('messages.upsert', ({ messages, type }) => {
        if (type!== 'notify') return;
        for (const msg of messages) {
            if (!msg.message) continue;
            const chatJid = msg.key.remoteJid;
            const isGroupChat = chatJid?.endsWith('@g.us');
            const sender = normalizeJid(msg.key.participant || chatJid);
            const isOwnerDM =!isGroupChat && (normalizeJid(chatJid) === normalizeJid(OWNER_JID) || msg.key.fromMe);
            if (isOwnerDM || isGroupChat) {
                const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption || '';
                messageCache.set(msg.key.id, {
                    key: msg.key,
                    text: text,
                    hasMedia:!!(msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.audioMessage || msg.message?.stickerMessage),
                    mediaType: msg.message?.imageMessage? 'image' : msg.message?.videoMessage? 'video' : msg.message?.audioMessage? 'audio' : msg.message?.stickerMessage? 'sticker' : null,
                    chatJid,
                    sender,
                    timestamp: Date.now()
                });
            }
        }
    });
    sock.ev.on('messages.delete', async (item) => {
        try {
            const keys = item.keys || (item.ids?.map(id => ({ id, remoteJid: item.jid }))) || [];
            for (const key of keys) {
                const cached = messageCache.get(key.id);
                if (!cached) continue;
                const { key: msgKey, text, hasMedia, mediaType, chatJid, sender } = cached;
                messageCache.del(key.id);
                const senderNum = sender.replace('@s.whatsapp.net', '').replace('@c.us', '');
                const chatLabel = chatJid.endsWith('@g.us')? `Group: ${chatJid}` : `DM: +${senderNum}`;
                let notifText = `🗑️ *Anti-Delete Alert*\n\n`;
                notifText += `📍 *Kutoka:* ${chatLabel}\n`;
                notifText += `👤 *Sender:* +${senderNum}\n`;
                notifText += `🕐 *Wakati:* ${new Date().toLocaleTimeString('sw-TZ')}\n\n`;
                notifText += text? `💬 *Ujumbe:* ${text}` : `📎 *[Media iliyofutwa]*`;
                try {
                    await sock.sendMessage(OWNER_JID, { text: notifText });
                } catch (err) {
                    console.error('❌ Anti-delete notification error:', err.message);
                }
                if (hasMedia && mediaType) {
                    try {
                        const fullMsg = await sock.loadMessage(chatJid, msgKey.id);
                        if (fullMsg?.message) {
                            const mediaMessage = fullMsg.message.imageMessage || fullMsg.message.videoMessage || fullMsg.message.audioMessage || fullMsg.message.stickerMessage;
                            if (mediaMessage) {
                                const buffer = await downloadMediaSafe(mediaMessage, mediaType);
                                if (buffer) {
                                    const sendPayload =
                                        mediaType === 'image'? { image: buffer, caption: text || '🖼️ [Picha iliyofutwa]' } :
                                        mediaType === 'video'? { video: buffer, caption: text || '🎥 [Video iliyofutwa]' } :
                                        mediaType === 'audio'? { audio: buffer, mimetype: 'audio/mp4' } :
                                        { sticker: buffer };
                                    try {
                                        await sock.sendMessage(OWNER_JID, sendPayload);
                                    } catch (sendErr) {
                                        console.error('❌ Anti-delete media send error:', sendErr.message);
                                    }
                                }
                            }
                        }
                    } catch (mediaErr) {
                        console.error('❌ Anti-delete media error:', mediaErr.message);
                    }
                }
            }
        } catch (err) {
            console.error('❌ Anti-delete error:', err.message);
        }
    });
    console.log('🛡️ Anti-Delete: Imewashwa');
}

// ════════════════
// 📊 AUTO STATUS VIEWER + REACT - RANDOM VERSION NO WHITELIST
// ════════════════
const STATUS_REACTIONS = ['🔥', '👍', '😍', '🥰', '💯', '😊', '✨'];
const viewedStatusCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });
const statusProcessingQueue = new Set();

function randomReaction() {
    return STATUS_REACTIONS[Math.floor(Math.random() * STATUS_REACTIONS.length)];
}

export function setupAutoStatusViewer(sock) {
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type!== 'notify') return;

        for (const msg of messages) {
            if (!msg.message) continue;
            if (msg.key.remoteJid!== 'status@broadcast') continue;
            if (msg.key.fromMe) continue;

            const statusId = msg.key.id;
            const posterJid = msg.key.participant || msg.key.remoteJid;
            const posterNum = posterJid.split('@')[0] || 'Unknown';

            if (viewedStatusCache.has(statusId) || statusProcessingQueue.has(statusId)) {
                continue;
            }

            statusProcessingQueue.add(statusId);

            try {
                const delay = Math.floor(Math.random() * 10000) + 20000;
                await sleep(delay);

                await sock.readMessages([msg.key]);
                viewedStatusCache.set(statusId, true);

                const reaction = global.autoStatusLike? '🔥' : randomReaction();

                await sock.sendMessage('status@broadcast', {
                    react: {
                        text: reaction,
                        key: msg.key
                    }
                });

                console.log(`✅ Status +${posterNum} → viewed ✅ reacted ${reaction}`);

            } catch (err) {
                console.error(`❌ Status error (+${posterNum}):`, err.message);
                viewedStatusCache.del(statusId);
            } finally {
                statusProcessingQueue.delete(statusId);
            }
        }
    });

    console.log(`📊 Auto Status Viewer: ✅ Imewashwa | Mode: ${global.autoStatusLike? 'LIKE ONLY 🔥' : 'RANDOM REACT'} | Delay: 20-30s`);
}