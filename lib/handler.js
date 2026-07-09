import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import NodeCache from 'node-cache';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import {
    prefix as _prefix,
    packname,
    author,
    publicVar,
    chatbot,
    autoreact,
    autobio,
    welcome,
    ANTI_TAG,
    anticall,
    ANTI_TEMU,
    autoStatusReact,
    ANTIDELETE
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

        if (autoreact && chatJid!== 'status@broadcast' &&!msg.key.fromMe) {
            const REACT_EMOJIS = ['👍', '✅', '🔥', '💯', '😊'];
            const emoji = REACT_EMOJIS[Math.floor(Math.random() * REACT_EMOJIS.length)];
            sock.sendMessage(chatJid, {
                react: { text: emoji, key: msg.key }
            }).catch(() => {});
        }

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
            const canUseCommands = isActualOwner || (publicVar && senderIsGroupAdmin);
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
        if (!publicVar &&!isActualOwner) return;
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

// ════════════════
// 🛡️ ANTI-DELETE — media inapakuliwa NA kuhifadhiwa mapema (kabla ya kufutwa)
// ════════════════
const MAX_MEDIA_BYTES = 8 * 1024 * 1024; // 8MB — epuka kula RAM nyingi kwenye video kubwa
const messageCache = new NodeCache({ stdTTL: 3600, checkperiod: 600, maxKeys: 150 });

async function downloadMediaSafe(mediaMessage, mediaType) {
    let stream;
    try {
        stream = await downloadContentFromMessage(mediaMessage, mediaType);
        const chunks = [];
        let total = 0;
        for await (const chunk of stream) {
            total += chunk.length;
            if (total > MAX_MEDIA_BYTES) {
                console.log('⚠️ Media kubwa mno, sikuhifadhi kwa anti-delete');
                return null;
            }
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
    if (!ANTIDELETE) return console.log('🛡️ Anti-Delete: Imezimwa');

    async function sendDeleteAlert(deletedKeyId, chatJidFallback) {
        const cached = messageCache.get(deletedKeyId);
        if (!cached) return;
        messageCache.del(deletedKeyId);

        const { text, hasMedia, mediaType, mediaBuffer, chatJid, sender } = cached;
        const senderNum = sender.split('@')[0];
        const isGroup = (chatJid || chatJidFallback).endsWith('@g.us');

        let notifText = `🗑️ *ANTI-DELETE ALERT*\n\n`;
        notifText += `👤 *Mtu:* @${senderNum}\n`;
        notifText += `📍 *Mahali:* ${isGroup ? 'Group' : 'DM'}\n`;
        notifText += `⏰ *Muda:* ${new Date().toLocaleTimeString('sw-TZ')}\n\n`;
        notifText += text ? `💬 *Ujumbe:* ${text}` : '';

        const targetJid = isGroup ? chatJid : OWNER_JID;
        const mentionOpt = isGroup ? { mentions: [sender] } : {};

        if (hasMedia && mediaBuffer) {
            const sendPayload =
                mediaType === 'image' ? { image: mediaBuffer, caption: notifText || '🖼️ [Picha iliyofutwa]' } :
                mediaType === 'video' ? { video: mediaBuffer, caption: notifText || '🎥 [Video iliyofutwa]' } :
                mediaType === 'audio' ? { audio: mediaBuffer, mimetype: 'audio/mp4' } :
                { sticker: mediaBuffer };

            await sock.sendMessage(targetJid, sendPayload, mentionOpt).catch(async () => {
                await sock.sendMessage(OWNER_JID, { text: notifText + '\n\n_⚠️ Sikuweza kutuma media/kurudisha group_' }).catch(() => {});
            });

            if (mediaType === 'audio' || mediaType === 'sticker') {
                await sock.sendMessage(targetJid, { text: notifText, ...mentionOpt }).catch(() => {});
            }
        } else {
            const finalText = hasMedia
                ? notifText + `\n📎 *[Media iliyofutwa — haikuweza kuhifadhiwa mapema]*`
                : notifText;
            await sock.sendMessage(targetJid, { text: finalText, ...mentionOpt }).catch(async () => {
                await sock.sendMessage(OWNER_JID, { text: finalText + '\n\n_⚠️ Sikurudisha group kwa sababu si admin_' }).catch(() => {});
            });
        }
    }

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
            if (!msg.message) continue;

            // 🔴 Shika "Delete for Everyone" (REVOKE) inayokuja kama protocol message
            const protocolMsg = msg.message.protocolMessage;
            if (protocolMsg?.type === 0 && protocolMsg?.key?.id) {
                sendDeleteAlert(protocolMsg.key.id, msg.key.remoteJid).catch(err =>
                    console.error('❌ Anti-delete revoke error:', err.message)
                );
                continue;
            }

            if (msg.key.fromMe) continue;
            const chatJid = msg.key.remoteJid;
            if (chatJid === 'status@broadcast') continue;

            const sender = normalizeJid(msg.key.participant || chatJid);
            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption || '';

            const imgMsg = msg.message?.imageMessage;
            const vidMsg = msg.message?.videoMessage;
            const audMsg = msg.message?.audioMessage;
            const stkMsg = msg.message?.stickerMessage;
            const hasMedia = !!(imgMsg || vidMsg || audMsg || stkMsg);
            const mediaType = imgMsg ? 'image' : vidMsg ? 'video' : audMsg ? 'audio' : stkMsg ? 'sticker' : null;

            // Weka entry mapema (bila buffer) — hii inahakikisha text/DM zisipotee hata bila media
            messageCache.set(msg.key.id, {
                text, hasMedia, mediaType, mediaBuffer: null, chatJid, sender
            });

            // Pakua media SASA HIVI kabla haijafutwa — hii ndiyo fix ya msingi
            if (hasMedia) {
                try {
                    const mediaMessage = imgMsg || vidMsg || audMsg || stkMsg;
                    const buffer = await downloadMediaSafe(mediaMessage, mediaType);
                    if (buffer) {
                        const existing = messageCache.get(msg.key.id);
                        if (existing) {
                            existing.mediaBuffer = buffer;
                            messageCache.set(msg.key.id, existing);
                        }
                    }
                } catch (dlErr) {
                    console.error('❌ Anti-delete pre-download error:', dlErr.message);
                }
            }
        }
    });

    // Fallback kwa matoleo yanayotuma messages.delete moja kwa moja
    sock.ev.on('messages.delete', async (item) => {
        try {
            const keys = item.keys || (item.ids?.map(id => ({ id, remoteJid: item.jid }))) || [];
            for (const key of keys) {
                await sendDeleteAlert(key.id, key.remoteJid);
            }
        } catch (err) {
            console.error('❌ Anti-delete error:', err.message);
        }
    });

    console.log('🛡️ Anti-Delete: ✅ Imewashwa (media inahifadhiwa mapema, max 8MB)');
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

                if (autoStatusReact) {
                    const reaction = global.autoStatusLike? '🔥' : randomReaction();

                    await sock.sendMessage('status@broadcast', {
                        react: {
                            text: reaction,
                            key: msg.key
                        }
                    });

                    console.log(`✅ Status +${posterNum} → viewed ✅ reacted ${reaction}`);
                } else {
                    console.log(`✅ Status +${posterNum} → viewed only (react disabled)`);
                }

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

// ════════════════
// 🔄 AUTO BIO UPDATER
// ════════════════
let autoBioTimer = null;
export function setupAutoBio(sock) {
    if (!autobio) return;
    if (autoBioTimer) clearInterval(autoBioTimer);

    const updateBio = async () => {
        try {
            const now = new Date().toLocaleString('sw-TZ', { hour: '2-digit', minute: '2-digit' });
            await sock.updateProfileStatus(`⚡ 26-TECH BOT | Active | ${now}`);
        } catch (err) {
            console.error('❌ Auto bio error:', err.message);
        }
    };

    updateBio();
    autoBioTimer = setInterval(updateBio, 10 * 60 * 1000);
    console.log('📝 Auto Bio: Imewashwa (kila dakika 10)');
}

// ════════════════
// 👋 WELCOME / GOODBYE MESSAGES
// ════════════════
export function setupWelcome(sock) {
    if (!welcome) return;
    sock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action } = update;
        try {
            let meta = groupMetaCache.get(id);
            if (!meta) {
                meta = await sock.groupMetadata(id);
                groupMetaCache.set(id, meta);
            }

            for (const participant of participants) {
                const num = participant.split('@')[0];
                if (action === 'add') {
                    await sock.sendMessage(id, {
                        text: `👋 *Karibu* @${num} kwenye *${meta.subject}*!\n\n_Soma group rules kabla ya kuchat._`,
                        mentions: [participant]
                    });
                } else if (action === 'remove') {
                    await sock.sendMessage(id, {
                        text: `👋 @${num} ametoka kwenye group. Kwaheri!`,
                        mentions: [participant]
                    });
                }
            }
        } catch (err) {
            console.error('❌ Welcome message error:', err.message);
        }
    });
    console.log('👋 Welcome/Goodbye: Imewashwa');
}

// ════════════════
// 🚫 ANTI-TAG (zuia @everyone / tag-all spam kutoka wasio-admin)
// ════════════════
export function setupAntiTag(sock) {
    if (!ANTI_TAG) return;
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type!== 'notify') return;
        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe) continue;
            const chatJid = msg.key.remoteJid;
            if (!chatJid?.endsWith('@g.us')) continue;

            const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            if (mentions.length < 5) continue;

            try {
                let meta = groupMetaCache.get(chatJid);
                if (!meta) {
                    meta = await sock.groupMetadata(chatJid);
                    groupMetaCache.set(chatJid, meta);
                }

                const sender = msg.key.participant || chatJid;
                const senderNorm = normalizeJid(sender);
                const participant = meta.participants.find(p => normalizeJid(p.id) === senderNorm);
                const isSenderAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';
                if (isSenderAdmin) continue;

                const botNumber = sock.user.id.replace(/:\d+@/, '@');
                const botParticipant = meta.participants.find(p => p.id === botNumber);
                const isBotAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin';

                await sock.sendMessage(chatJid, { delete: msg.key }).catch(() => {});

                if (isBotAdmin) {
                    await sock.groupParticipantsUpdate(chatJid, [sender], 'remove').catch(() => {});
                    await sock.sendMessage(chatJid, {
                        text: `🚫 *Anti-Tag:* @${sender.split('@')[0]} ametolewa kwa kutuma tag-all bila ruhusa.`,
                        mentions: [sender]
                    });
                } else {
                    await sock.sendMessage(chatJid, {
                        text: `🚫 *Anti-Tag:* Ujumbe wa @${sender.split('@')[0]} umefutwa (tag-all spam). Bot si admin hivyo haiwezi kumtoa.`,
                        mentions: [sender]
                    });
                }
            } catch (err) {
                console.error('❌ Anti-tag error:', err.message);
            }
        }
    });
    console.log('🚫 Anti-Tag: Imewashwa');
}

// ════════════════
// 📵 ANTI-CALL (kataa simu zinazoingia kiotomatiki) — Baileys v7 rc13
// ════════════════
const handledCallIds = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

export function setupAntiCall(sock) {
    if (!anticall) return;
    sock.ev.on('call', async (calls) => {
        for (const call of calls) {
            if (call.status!== 'offer') continue;

            const callerJid = call.from || call.chatId;
            const dedupKey = `${callerJid}:${call.id}`;
            if (handledCallIds.has(dedupKey)) continue;
            handledCallIds.set(dedupKey, true);

            try {
                await sock.rejectCall(call.id, callerJid);
                await sock.sendMessage(callerJid, {
                    text: `📵 *Anti-Call:* Simu haziruhusiwi kwa bot hii. Ujumbe wa maandishi tu.`
                }).catch(() => {});
                console.log(`📵 Simu kutoka ${callerJid} imekataliwa`);
            } catch (err) {
                console.error('❌ Anti-call error:', err.message);
            }
        }
    });
    console.log('📵 Anti-Call: Imewashwa');
}

// ════════════════
// 🛑 ANTI-TEMU (zuia links za spam/matangazo ya Temu na store links kama hizo)
// ════════════════
const TEMU_PATTERN = /(temu\.com|temu\.to|shein\.com|aliexpress\.com\/\S*\?.*aff)/i;

export function setupAntiTemu(sock) {
    if (!ANTI_TEMU) return;
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type!== 'notify') return;
        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe) continue;
            const chatJid = msg.key.remoteJid;
            if (!chatJid?.endsWith('@g.us')) continue;

            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
            if (!TEMU_PATTERN.test(text)) continue;

            try {
                const sender = msg.key.participant || chatJid;
                let meta = groupMetaCache.get(chatJid);
                if (!meta) {
                    meta = await sock.groupMetadata(chatJid);
                    groupMetaCache.set(chatJid, meta);
                }

                const senderNorm = normalizeJid(sender);
                const participant = meta.participants.find(p => normalizeJid(p.id) === senderNorm);
                const isSenderAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';
                if (isSenderAdmin) continue;

                await sock.sendMessage(chatJid, { delete: msg.key }).catch(() => {});
                await sock.sendMessage(chatJid, {
                    text: `🛑 *Anti-Temu:* Ujumbe wa @${sender.split('@')[0]} umefutwa (link ya matangazo/spam).`,
                    mentions: [sender]
                });
                console.log(`🛑 Temu/spam link kutoka +${sender.split('@')[0]} imefutwa`);
            } catch (err) {
                console.error('❌ Anti-temu error:', err.message);
            }
        }
    });
    console.log('🛑 Anti-Temu: Imewashwa');
}