/**
 * commands/setpp.js
 * Kubadili picha ya wasifu ya boti — Improved v2 by 26-TECH
 * Features: retry logic, image validation, size check, crop support, group pp support
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

// ── Helper: Angalia kama ni picha halisi (magic bytes) ──────────
function isValidImageBuffer(buffer) {
    if (!buffer || buffer.length < 4) return false;
    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;
    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;
    // WEBP: RIFF....WEBP
    if (buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
        buffer.slice(8, 12).toString('ascii') === 'WEBP') return true;
    return false;
}

// ── Helper: Angalia ukubwa wa picha (max 5MB kwa WhatsApp) ──────
const MAX_SIZE_MB = 5;
function checkImageSize(buffer) {
    const sizeMB = buffer.length / (1024 * 1024);
    if (sizeMB > MAX_SIZE_MB) {
        throw new Error(`Picha ni kubwa sana (${sizeMB.toFixed(1)}MB). Kikomo ni ${MAX_SIZE_MB}MB.`);
    }
    return sizeMB;
}

// ── Helper: Toa imageMessage kutoka sehemu yoyote ya msg ────────
function extractImageMessage(msg) {
    // 1. Direct image
    if (msg.message?.imageMessage) return msg.message.imageMessage;

    // 2. Quoted image
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted?.imageMessage) return quoted.imageMessage;

    // 3. ViewOnce image (inaposaidika)
    if (msg.message?.viewOnceMessage?.message?.imageMessage)
        return msg.message.viewOnceMessage.message.imageMessage;

    // 4. ViewOnce V2
    if (msg.message?.viewOnceMessageV2?.message?.imageMessage)
        return msg.message.viewOnceMessageV2.message.imageMessage;

    return null;
}

// ── Main Command ────────────────────────────────────────────────
export const name        = 'setpp';
export const description = 'Kubadili picha ya wasifu ya boti au group';
export const category    = 'admin';
export const use         = '<tuma/reply picha> [group - kwa group pp]';
export const alias       = ['setppbot', 'badilapp', 'changepp'];
export const adminOnly   = true;

export async function execute(sock, msg, args) {
    const from   = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');

    // ── Angalia kama weka group flag ──
    // .setpp group → badilisha picha ya group
    // .setpp       → badilisha picha ya boti
    const setGroupPP = args[0]?.toLowerCase() === 'group' && isGroup;
    const targetJid  = setGroupPP ? from : sock.user.id;
    const targetName = setGroupPP ? 'group' : 'boti (26-TECH)';

    // ── Toa picha ──
    const imageMessage = extractImageMessage(msg);

    if (!imageMessage) {
        return await sock.sendMessage(from, {
            text: [
                `❌ *Picha haijapatikana!*`,
                ``,
                `📌 *Jinsi ya kutumia:*`,
                `• Tuma picha na caption \`.setpp\``,
                `• Au reply picha yoyote kwa \`.setpp\``,
                isGroup ? `• Kwa group pp: \`.setpp group\`` : '',
            ].filter(Boolean).join('\n')
        }, { quoted: msg });
    }

    try {
        // ── Status: Inaanza ──
        await sock.sendMessage(from, {
            text: `⏳ *Inapakua na kubadilisha picha ya ${targetName}...*`
        }, { quoted: msg });

        // ── Pakua buffer (na retry) ──
        const buffer = await downloadImageBuffer(imageMessage);

        // ── Validate ──
        if (!isValidImageBuffer(buffer)) {
            return await sock.sendMessage(from, {
                text: `❌ Faili hii si picha halisi (JPEG/PNG/WEBP tu zinakubaliwa).`
            }, { quoted: msg });
        }

        const sizeMB = checkImageSize(buffer);

        // ── Badilisha PP ──
        await sock.updateProfilePicture(targetJid, buffer);

        // ── Success ──
        await sock.sendMessage(from, {
            text: [
                `✅ *Picha ya wasifu imebadilishwa!*`,
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

        // ── Majibu ya makosa maalum ──
        let errMsg = `❌ Imeshindwa kubadili picha.`;

        if (error.message?.includes('not-authorized') || error.message?.includes('403')) {
            errMsg = `❌ Boti haina ruhusa ya kubadilisha picha ya group hii.\nHakikisha boti ni *admin* wa group.`;
        } else if (error.message?.includes('kubwa')) {
            errMsg = `❌ ${error.message}`;
        } else if (error.message?.includes('Buffer tupu')) {
            errMsg = `❌ Picha imeshindwa kupakiwa. Jaribu picha nyingine.`;
        } else if (error.message?.includes('timedout') || error.message?.includes('timeout')) {
            errMsg = `❌ Muda umekwisha wakati wa kupakua picha. Jaribu tena.`;
        } else {
            errMsg = `❌ Hitilafu: ${error.message}`;
        }

        await sock.sendMessage(from, { text: errMsg }, { quoted: msg });
    }
}

// ── Helper: Pata format ya picha ────────────────────────────────
function getFormat(buffer) {
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'JPEG';
    if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'PNG';
    if (buffer.slice(8, 12).toString('ascii') === 'WEBP') return 'WEBP';
    return 'Unknown';
}
