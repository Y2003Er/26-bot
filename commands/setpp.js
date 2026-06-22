/**
 * commands/setpp.js
 * Kubadili picha ya wasifu — v3 by 26-TECH
 * Targets: boti | group | mtu aliyetagiwa
 */

import { downloadContentFromMessage } from '@whiskeysockets/baileys';

// ── Helper: Pakua buffer kwa retry ──────────────────────────────
async function downloadImageBuffer(imageMessage, retries = 3) {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const stream = await downloadContentFromMessage(imageMessage, 'image');
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const buffer = Buffer.concat(chunks);
            if (buffer.length < 100) throw new Error('Buffer tupu au ndogo sana');
            return buffer;
        } catch (err) {
            lastError = err;
            if (attempt < retries) {
                console.warn(`⚠️ setpp download attempt ${attempt} imefeli — inajaribu tena...`);
                await new Promise(r => setTimeout(r, 1500 * attempt));
            }
        }
    }
    throw lastError;
}

// ── Helper: Validate picha kwa magic bytes ───────────────────────
function isValidImageBuffer(buffer) {
    if (!buffer || buffer.length < 4) return false;
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true; // JPEG
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true; // PNG
    if (buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
        buffer.slice(8, 12).toString('ascii') === 'WEBP') return true; // WEBP
    return false;
}

// ── Helper: Size check (max 5MB) ─────────────────────────────────
function checkImageSize(buffer) {
    const sizeMB = buffer.length / (1024 * 1024);
    if (sizeMB > 5) throw new Error(`Picha ni kubwa sana (${sizeMB.toFixed(1)}MB). Kikomo ni 5MB.`);
    return sizeMB;
}

// ── Helper: Pata format ya picha ─────────────────────────────────
function getFormat(buffer) {
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'JPEG';
    if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'PNG';
    if (buffer.slice(8, 12).toString('ascii') === 'WEBP') return 'WEBP';
    return 'Unknown';
}

// ── Helper: Toa imageMessage kutoka sehemu yoyote ────────────────
function extractImageMessage(msg) {
    if (msg.message?.imageMessage) return msg.message.imageMessage;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted?.imageMessage) return quoted.imageMessage;
    if (msg.message?.viewOnceMessage?.message?.imageMessage)
        return msg.message.viewOnceMessage.message.imageMessage;
    if (msg.message?.viewOnceMessageV2?.message?.imageMessage)
        return msg.message.viewOnceMessageV2.message.imageMessage;
    return null;
}

// ── Helper: Normalize JID ────────────────────────────────────────
function normalizeJid(jid) {
    if (!jid) return null;
    return jid.includes('@') ? jid : `${jid}@s.whatsapp.net`;
}

// ── Main Command ─────────────────────────────────────────────────
export const name        = 'setpp';
export const description = 'Kubadili picha ya wasifu — boti, group, au mtu';
export const category    = 'admin';
export const use         = '<picha> [group | @tag]';
export const alias       = ['setppbot', 'badilapp', 'changepp'];
export const adminOnly   = true;

export async function execute(sock, msg, args) {
    const from    = msg.key.remoteJid;
    const sender  = msg.key.participant || msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');

    // ════════════════════════════════════════════
    //   TAMBUA TARGET
    // ════════════════════════════════════════════

    let targetJid  = sock.user.id; // default = boti
    let targetName = '🤖 Boti (26-TECH)';
    let needsOwner = true; // boti na @tag zinahitaji owner

    const firstArg = args[0]?.toLowerCase();

    if (firstArg === 'group') {
        // ── Target: Group ──
        if (!isGroup) {
            return await sock.sendMessage(from, {
                text: `❌ Amri hii ya *group* inafanya kazi ndani ya group tu.`
            }, { quoted: msg });
        }
        targetJid  = from;
        targetName = '👥 Group';
        needsOwner = false; // group admin anatosha kwa group PP

    } else {
        // ── Target: Mtu aliyetagiwa ──
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        const taggedUser = mentioned?.[0] || null;

        if (taggedUser) {
            targetJid  = normalizeJid(taggedUser);
            targetName = `👤 @${taggedUser.split('@')[0]}`;
            needsOwner = true; // lazima owner kubadilisha PP ya mtu
        }
        // else → default ni boti (tayari imewekwa juu)
    }

    // ════════════════════════════════════════════
    //   OWNER CHECK
    // ════════════════════════════════════════════
    if (needsOwner && !global.isOwner(sender)) {
        return await sock.sendMessage(from, {
            text: [
                `❌ *Ruhusa Imekataliwa!*`,
                ``,
                `• Kubadilisha PP ya boti → *Owner tu*`,
                `• Kubadilisha PP ya mtu  → *Owner tu*`,
                `• Kubadilisha PP ya group → *Group Admin* anatosha`,
            ].join('\n')
        }, { quoted: msg });
    }

    // ── Kwa group PP — angalia kama boti ni admin ──
    if (targetJid === from) {
        try {
            const groupMeta   = await sock.groupMetadata(from);
            const botNumber   = sock.user.id.replace(/:\d+@/, '@');
            const botIsAdmin  = groupMeta.participants.some(p =>
                (p.id === botNumber || p.id === sock.user.id) &&
                (p.admin === 'admin' || p.admin === 'superadmin')
            );
            if (!botIsAdmin) {
                return await sock.sendMessage(from, {
                    text: `❌ Boti lazima iwe *admin* wa group ili kubadilisha picha ya group.`
                }, { quoted: msg });
            }
        } catch (_) {}
    }

    // ════════════════════════════════════════════
    //   ANGALIA PICHA
    // ════════════════════════════════════════════
    const imageMessage = extractImageMessage(msg);

    if (!imageMessage) {
        return await sock.sendMessage(from, {
            text: [
                `❌ *Picha haijapatikana!*`,
                ``,
                `📌 *Jinsi ya kutumia:*`,
                `• Tuma picha + caption \`.setpp\`  → PP ya boti`,
                `• Reply picha + \`.setpp\`          → PP ya boti`,
                `• Reply picha + \`.setpp group\`    → PP ya group`,
                `• Reply picha + \`.setpp @tag\`     → PP ya mtu (Owner tu)`,
            ].join('\n')
        }, { quoted: msg });
    }

    // ════════════════════════════════════════════
    //   PAKUA NA BADILISHA
    // ════════════════════════════════════════════
    try {
        await sock.sendMessage(from, {
            text: `⏳ *Inabadilisha PP ya ${targetName}...*`
        }, { quoted: msg });

        // Pakua buffer
        const buffer = await downloadImageBuffer(imageMessage);

        // Validate
        if (!isValidImageBuffer(buffer)) {
            return await sock.sendMessage(from, {
                text: `❌ Faili hii si picha halisi. Tumia JPEG, PNG, au WEBP tu.`
            }, { quoted: msg });
        }

        const sizeMB = checkImageSize(buffer);

        // Badilisha PP
        await sock.updateProfilePicture(targetJid, buffer);

        // Success
        await sock.sendMessage(from, {
            text: [
                `✅ *Picha ya Wasifu Imebadilishwa!*`,
                ``,
                `📋 *Maelezo:*`,
                `• Target  : ${targetName}`,
                `• Ukubwa  : ${sizeMB.toFixed(2)} MB`,
                `• Format  : ${getFormat(buffer)}`,
                ``,
                `> ⚡ Powered by *26-𝐓𝐄𝐂𝐇*`,
            ].join('\n')
        }, { quoted: msg });

    } catch (error) {
        console.error('❌ setpp error:', error);

        let errMsg;
        if (error.message?.includes('not-authorized') || error.message?.includes('403')) {
            errMsg = `❌ Boti haina ruhusa ya kubadilisha PP ya ${targetName}.\nHakikisha boti ni admin (kwa group) au namba ni sahihi.`;
        } else if (error.message?.includes('kubwa')) {
            errMsg = `❌ ${error.message}`;
        } else if (error.message?.includes('Buffer tupu')) {
            errMsg = `❌ Picha imeshindwa kupakiwa. Jaribu picha nyingine.`;
        } else if (error.message?.includes('timeout') || error.message?.includes('timedout')) {
            errMsg = `❌ Muda umekwisha. Jaribu tena baadaye.`;
        } else {
            errMsg = `❌ Hitilafu: ${error.message}`;
        }

        await sock.sendMessage(from, { text: errMsg }, { quoted: msg });
    }
}
