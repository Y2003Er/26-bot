/**
 * commands/group.js
 * ─────────────────────────────────────────────────────────────
 * Group commands — module-style (export name + execute)
 * Inatumia raw sock + msg directly
 * Owner anafanya kazi commands ZOTE bila kujali admin status yake
 * ─────────────────────────────────────────────────────────────
 */

import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { packname, author } from '../config.js';

// ── Helpers ──────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const Config = {
    caption: `*${packname || '26-TECH'}* | _${author || 'Bot'}_`
};

function normalizeJid(jid) {
    if (!jid) return '';
    return jid.replace(/:\d+@/, '@');
}

function getMsgText(msg) {
    return (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        ''
    ).trim();
}

async function reply(sock, msg, text) {
    return sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
}

async function getGroupMeta(sock, chatJid) {
    try {
        return await sock.groupMetadata(chatJid);
    } catch {
        return null;
    }
}

/**
 * Angalia kama BOT ni admin — inahitajika kwa kick/promote/demote/mute n.k.
 * Owner admin check IMEONDOLEWA — owner anafanya kazi bila kujali status yake
 */
async function isBotAdmin(sock, chatJid) {
    try {
        const meta   = await getGroupMeta(sock, chatJid);
        if (!meta) return false;
        const botId  = normalizeJid(sock.user?.id  || '');
        const botLid = normalizeJid(sock.user?.lid || '');
        const me     = meta.participants.find(p => {
            const n = normalizeJid(p.id);
            return n === botId || n === botLid;
        });
        return me?.admin === 'admin' || me?.admin === 'superadmin';
    } catch {
        return false;
    }
}

const groupLinkPattern = /https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{22}/g;

// ════════════════════════════════════════════════════════════════
//   JOIN
// ════════════════════════════════════════════════════════════════
export const join = {
    name:        'join',
    description: 'Ingia group kwa link',
    category:    'whatsapp',
    use:         '<group link>',
    alias:       [],
    adminOnly:   false,

    async execute(sock, msg, args) {
        const text    = args.join(' ').trim() || getMsgText(msg);
        const matches = text.match(groupLinkPattern);
        if (!matches) {
            return reply(sock, msg, '*_Toa group link_*\nMfano: .join https://chat.whatsapp.com/...');
        }
        const code = matches[0].split('https://chat.whatsapp.com/')[1].trim();
        try {
            await sock.groupAcceptInvite(code);
            return reply(sock, msg, '*_✅ Imeingia group!_*');
        } catch {
            return reply(sock, msg, '*_❌ Imeshindwa — link si sahihi au imekwisha._*');
        }
    }
};

// ════════════════════════════════════════════════════════════════
//   NEWGC
// ════════════════════════════════════════════════════════════════
export const newgc = {
    name:        'newgc',
    description: 'Tengeneza group mpya',
    category:    'whatsapp',
    use:         '<jina la group>',
    alias:       ['creategc'],
    adminOnly:   false,

    async execute(sock, msg, args) {
        const groupName = args.join(' ').trim().substring(0, 60);
        if (!groupName) return reply(sock, msg, '*_Toa jina la group_*');

        const rawSender = msg.key.participant || msg.key.remoteJid;
        const members   = [normalizeJid(rawSender)];

        const mentioned  = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const quotedPart = msg.message?.extendedTextMessage?.contextInfo?.participant;
        if (quotedPart) members.push(normalizeJid(quotedPart));
        mentioned.forEach(j => members.push(normalizeJid(j)));

        try {
            const created = await sock.groupCreate(groupName, [...new Set(members)]);
            if (!created) return reply(sock, msg, '*_❌ Imeshindwa kutengeneza group._*');

            let link = '';
            try {
                const code = await sock.groupInviteCode(created.id);
                link = `https://chat.whatsapp.com/${code}`;
            } catch {}

            await sock.sendMessage(created.id, {
                text: `*_👋 Karibu kwenye group mpya!_*\n${Config.caption}`
            });

            return reply(sock, msg,
                `*_✅ Group imeundwa!_*\n\n` +
                `*Jina:* ${groupName}\n` +
                (link ? `*Link:* ${link}` : '')
            );
        } catch (e) {
            return reply(sock, msg, `*_❌ Imeshindwa: ${e.message}_*`);
        }
    }
};

// ════════════════════════════════════════════════════════════════
//   GINFO
// ════════════════════════════════════════════════════════════════
export const ginfo = {
    name:        'ginfo',
    description: 'Pata maelezo ya group kwa link',
    category:    'group',
    use:         '<group link>',
    alias:       [],
    adminOnly:   false,

    async execute(sock, msg, args) {
        const text    = args.join(' ').trim() || getMsgText(msg);
        const matches = text.match(groupLinkPattern);
        if (!matches) return reply(sock, msg, '*_Toa group link_*');

        const code = matches[0].split('https://chat.whatsapp.com/')[1].trim();
        try {
            const info    = await sock.groupGetInviteInfo(code);
            const created = new Date(info.creation * 1000).toISOString().split('T')[0];

            let out  = `*${info.subject}*\n\n`;
            out     += `👤 *Creator:* wa.me/${info.owner?.split('@')[0]}\n`;
            out     += `🆔 *GJid:* \`${info.id}\`\n`;
            out     += `🔇 *Muted:*  ${info.announce  ? 'Ndiyo' : 'Hapana'}\n`;
            out     += `🔒 *Locked:* ${info.restrict   ? 'Ndiyo' : 'Hapana'}\n`;
            out     += `📅 *Imeundwa:* ${created}\n`;
            out     += `👥 *Wanachama:* ${info.size}\n`;
            if (info.desc) out += `📝 *Maelezo:* ${info.desc}\n`;
            out     += `\n${Config.caption}`;

            return reply(sock, msg, out);
        } catch {
            return reply(sock, msg, '*_❌ Group haipatikani au link si sahihi._*');
        }
    }
};

// ════════════════════════════════════════════════════════════════
//   REJECTALL
// ════════════════════════════════════════════════════════════════
export const rejectall = {
    name:        'rejectall',
    description: 'Kataa maombi yote ya kujiunga group',
    category:    'group',
    use:         '',
    alias:       ['rejectjoin'],
    adminOnly:   true,

    async execute(sock, msg, args) {
        const chatJid = msg.key.remoteJid;
        if (!chatJid.endsWith('@g.us')) return reply(sock, msg, '*_Command hii ni ya group tu!_*');

        if (!await isBotAdmin(sock, chatJid)) {
            return reply(sock, msg, '*_Fanya bot admin kwanza!_*');
        }

        const requests = await sock.groupRequestParticipantsList(chatJid).catch(() => []);
        if (!requests?.length) return reply(sock, msg, '*_Hakuna maombi ya kujiunga._*');

        let rejected = [];
        let out      = `*❌ Waliofutwa (${requests.length}):*\n\n`;
        for (const req of requests) {
            try {
                await sock.groupRequestParticipantsUpdate(chatJid, [req.jid], 'reject');
                out += `• @${req.jid.split('@')[0]}\n`;
                rejected.push(req.jid);
            } catch {}
        }
        return sock.sendMessage(chatJid, { text: out, mentions: rejected }, { quoted: msg });
    }
};

// ════════════════════════════════════════════════════════════════
//   ACCEPTALL
// ════════════════════════════════════════════════════════════════
export const acceptall = {
    name:        'acceptall',
    description: 'Kubali maombi yote ya kujiunga group',
    category:    'group',
    use:         '',
    alias:       ['acceptjoin'],
    adminOnly:   true,

    async execute(sock, msg, args) {
        const chatJid = msg.key.remoteJid;
        if (!chatJid.endsWith('@g.us')) return reply(sock, msg, '*_Command hii ni ya group tu!_*');

        if (!await isBotAdmin(sock, chatJid)) {
            return reply(sock, msg, '*_Fanya bot admin kwanza!_*');
        }

        const requests = await sock.groupRequestParticipantsList(chatJid).catch(() => []);
        if (!requests?.length) return reply(sock, msg, '*_Hakuna maombi ya kujiunga._*');

        let accepted = [];
        let out      = `*✅ Waliokubaliwa (${requests.length}):*\n\n`;
        for (const req of requests) {
            try {
                await sock.groupRequestParticipantsUpdate(chatJid, [req.jid], 'approve');
                out += `• @${req.jid.split('@')[0]}\n`;
                accepted.push(req.jid);
            } catch {}
        }
        return sock.sendMessage(chatJid, { text: out, mentions: accepted }, { quoted: msg });
    }
};

// ════════════════════════════════════════════════════════════════
//   LISTREQUEST
// ════════════════════════════════════════════════════════════════
export const listrequest = {
    name:        'listrequest',
    description: 'Orodha ya watu wanaoomba kujiunga',
    category:    'group',
    use:         '',
    alias:       ['requestjoin'],
    adminOnly:   false,

    async execute(sock, msg, args) {
        const chatJid = msg.key.remoteJid;
        if (!chatJid.endsWith('@g.us')) return reply(sock, msg, '*_Command hii ni ya group tu!_*');

        const requests = await sock.groupRequestParticipantsList(chatJid).catch(() => []);
        if (!requests?.length) return reply(sock, msg, '*_Hakuna maombi ya kujiunga._*');

        let jids = [];
        let out  = `*📋 Maombi ya Kujiunga (${requests.length}):*\n\n`;
        for (const req of requests) {
            out += `• @${req.jid.split('@')[0]}\n`;
            jids.push(req.jid);
        }
        return sock.sendMessage(chatJid, { text: out, mentions: jids }, { quoted: msg });
    }
};

// ════════════════════════════════════════════════════════════════
//   SETDESC — Haihitaji owner wala bot kuwa admin kwa baadhi ya groups
// ════════════════════════════════════════════════════════════════
export const setdesc = {
    name:        'setdesc',
    description: 'Weka maelezo ya group',
    category:    'group',
    use:         '<maelezo>',
    alias:       ['setgdesc', 'gdesc'],
    adminOnly:   false,

    async execute(sock, msg, args) {
        const chatJid = msg.key.remoteJid;
        if (!chatJid.endsWith('@g.us')) return reply(sock, msg, '*_Command hii ni ya group tu!_*');

        const desc = args.join(' ').trim();
        if (!desc) return reply(sock, msg, '*_Toa maelezo ya group_*');

        try {
            await sock.groupUpdateDescription(chatJid, `${desc}\n\n\t${Config.caption}`);
            return reply(sock, msg, '*_✅ Maelezo ya group yamebadilishwa!_*');
        } catch (e) {
            return reply(sock, msg, `*_❌ Imeshindwa — fanya bot admin kwanza: ${e.message}_*`);
        }
    }
};

// ════════════════════════════════════════════════════════════════
//   SETNAME
// ════════════════════════════════════════════════════════════════
export const setname = {
    name:        'setname',
    description: 'Badilisha jina la group',
    category:    'group',
    use:         '<jina jipya>',
    alias:       ['setgname', 'gname'],
    adminOnly:   false,

    async execute(sock, msg, args) {
        const chatJid = msg.key.remoteJid;
        if (!chatJid.endsWith('@g.us')) return reply(sock, msg, '*_Command hii ni ya group tu!_*');

        const newName = args.join(' ').trim();
        if (!newName) return reply(sock, msg, '*_Toa jina jipya_*');

        try {
            await sock.groupUpdateSubject(chatJid, newName);
            return reply(sock, msg, '*_✅ Jina la group limebadilishwa!_*');
        } catch (e) {
            return reply(sock, msg, `*_❌ Imeshindwa — fanya bot admin kwanza: ${e.message}_*`);
        }
    }
};

// ════════════════════════════════════════════════════════════════
//   LEFT
// ════════════════════════════════════════════════════════════════
export const left = {
    name:        'left',
    description: 'Toka kwenye group',
    category:    'group',
    use:         '',
    alias:       ['leave'],
    adminOnly:   false,

    async execute(sock, msg, args) {
        const chatJid = msg.key.remoteJid;
        if (!chatJid.endsWith('@g.us')) return reply(sock, msg, '*_Command hii ni ya group tu!_*');

        const confirm = args[0]?.toLowerCase().trim();
        if (!confirm || !['sure', 'yes', 'ok', 'ndiyo'].includes(confirm)) {
            return reply(sock, msg, '*_Thibitisha: .left sure_*\n_(Andika sure/yes/ok/ndiyo)_');
        }

        try {
            await reply(sock, msg, '*_👋 Kwaheri! Ninaondoka..._*');
            await sleep(1000);
            await sock.groupLeave(chatJid);
        } catch (e) {
            return reply(sock, msg, `*_❌ Imeshindwa: ${e.message}_*`);
        }
    }
};

// ════════════════════════════════════════════════════════════════
//   GPP — Bot lazima iwe admin
// ════════════════════════════════════════════════════════════════
export const gpp = {
    name:        'gpp',
    description: 'Weka picha ya profile ya group',
    category:    'group',
    use:         '<reply picha>',
    alias:       [],
    adminOnly:   true,

    async execute(sock, msg, args) {
        const chatJid = msg.key.remoteJid;
        if (!chatJid.endsWith('@g.us')) return reply(sock, msg, '*_Command hii ni ya group tu!_*');

        if (!await isBotAdmin(sock, chatJid)) {
            return reply(sock, msg, '*_Fanya bot admin kwanza!_*');
        }

        const imageMsg =
            msg.message?.imageMessage ||
            msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

        if (!imageMsg) return reply(sock, msg, '*_Reply kwa picha kwanza_*');

        try {
            const stream = await downloadContentFromMessage(imageMsg, 'image');
            let   buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            await sock.updateProfilePicture(chatJid, buffer);
            return reply(sock, msg, '*_✅ Picha ya group imebadilishwa!_*');
        } catch (e) {
            return reply(sock, msg, `*_❌ Imeshindwa: ${e.message}_*`);
        }
    }
};

// ════════════════════════════════════════════════════════════════
//   TAGALL — Haihitaji owner wala bot kuwa admin
// ════════════════════════════════════════════════════════════════
export const tagall = {
    name:        'tagall',
    description: 'Tag wanachama wote wa group',
    category:    'group',
    use:         '[ujumbe]',
    alias:       [],
    adminOnly:   false,

    async execute(sock, msg, args) {
        const chatJid = msg.key.remoteJid;
        if (!chatJid.endsWith('@g.us')) return reply(sock, msg, '*_Command hii ni ya group tu!_*');

        const meta = await getGroupMeta(sock, chatJid);
        if (!meta) return reply(sock, msg, '*_Imeshindwa kupata group info._*');

        const participants = meta.participants || [];
        const customMsg    = args.join(' ').trim() || 'Ujumbe wa group';
        const pushName     = msg.pushName || 'Owner';

        let text  = `╔══✪〘 *TAG ALL* 〙✪══╗\n\n`;
        text     += `📢 *Ujumbe:* ${customMsg}\n`;
        text     += `✍️ *Na:* ${pushName}\n\n`;
        for (const p of participants) {
            text += `• @${p.id.split('@')[0]}\n`;
        }
        text += `\n${Config.caption}`;

        return sock.sendMessage(
            chatJid,
            { text, mentions: participants.map(p => p.id) },
            { quoted: msg }
        );
    }
};

// ════════════════════════════════════════════════════════════════
//   BROADCAST
// ════════════════════════════════════════════════════════════════
export const broadcast = {
    name:        'broadcast',
    description: 'Tuma ujumbe kwenye groups zote',
    category:    'group',
    use:         '<ujumbe>',
    alias:       ['bc'],
    adminOnly:   false,

    async execute(sock, msg, args) {
        const text = args.join(' ').trim();
        if (!text) return reply(sock, msg, '*_Toa ujumbe wa broadcast_*');

        let groups;
        try {
            groups = await sock.groupFetchAllParticipating();
        } catch {
            return reply(sock, msg, '*_❌ Imeshindwa kupata groups._*');
        }

        const ids = Object.keys(groups);
        await reply(sock, msg, `*_📡 Inatuma broadcast kwenye groups ${ids.length}..._*`);

        let sent = 0, failed = 0;
        for (const id of ids) {
            try {
                await sleep(1500);
                await sock.sendMessage(id, {
                    text: `*━━ 📡 26-𝚃𝙴𝙲𝙷 Broadcast ━━*\n\n${text}\n\n${Config.caption}`
                });
                sent++;
            } catch { failed++; }
        }

        return reply(sock, msg,
            `*_✅ Broadcast imekamilika!_*\n\n` +
            `✔️ Iliyofanikiwa: ${sent}\n` +
            `❌ Iliyoshindwa: ${failed}`
        );
    }
};

// ════════════════════════════════════════════════════════════════
//   KICK — Bot lazima iwe admin
// ════════════════════════════════════════════════════════════════
export const kick = {
    name:        'kick',
    description: 'Toa mtu kutoka group',
    category:    'group',
    use:         '@mention au reply',
    alias:       ['remove'],
    adminOnly:   true,

    async execute(sock, msg, args) {
        const chatJid = msg.key.remoteJid;
        if (!chatJid.endsWith('@g.us')) return reply(sock, msg, '*_Command hii ni ya group tu!_*');

        if (!await isBotAdmin(sock, chatJid)) {
            return reply(sock, msg, '*_Fanya bot admin kwanza!_*');
        }

        const mentioned  = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const quotedPart = msg.message?.extendedTextMessage?.contextInfo?.participant;
        const targets    = mentioned.length > 0 ? mentioned : quotedPart ? [normalizeJid(quotedPart)] : [];

        if (!targets.length) return reply(sock, msg, '*_Mention au reply mtu unayetaka kumtoa_*');

        try {
            await sock.groupParticipantsUpdate(chatJid, targets, 'remove');
            const names = targets.map(t => `+${t.replace('@s.whatsapp.net', '')}`).join(', ');
            return reply(sock, msg, `*_✅ Ametolewa: ${names}_*`);
        } catch (e) {
            return reply(sock, msg, `*_❌ Imeshindwa: ${e.message}_*`);
        }
    }
};

// ════════════════════════════════════════════════════════════════
//   PROMOTE — Bot lazima iwe admin
// ════════════════════════════════════════════════════════════════
export const promote = {
    name:        'promote',
    description: 'Fanya mtu admin wa group',
    category:    'group',
    use:         '@mention au reply',
    alias:       [],
    adminOnly:   true,

    async execute(sock, msg, args) {
        const chatJid = msg.key.remoteJid;
        if (!chatJid.endsWith('@g.us')) return reply(sock, msg, '*_Command hii ni ya group tu!_*');

        if (!await isBotAdmin(sock, chatJid)) {
            return reply(sock, msg, '*_Fanya bot admin kwanza!_*');
        }

        const mentioned  = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const quotedPart = msg.message?.extendedTextMessage?.contextInfo?.participant;
        const targets    = mentioned.length > 0 ? mentioned : quotedPart ? [normalizeJid(quotedPart)] : [];

        if (!targets.length) return reply(sock, msg, '*_Mention au reply mtu unayetaka kumfanya admin_*');

        try {
            await sock.groupParticipantsUpdate(chatJid, targets, 'promote');
            const names = targets.map(t => `+${t.replace('@s.whatsapp.net', '')}`).join(', ');
            return reply(sock, msg, `*_✅ Amefanywa admin: ${names}_*`);
        } catch (e) {
            return reply(sock, msg, `*_❌ Imeshindwa: ${e.message}_*`);
        }
    }
};

// ════════════════════════════════════════════════════════════════
//   DEMOTE — Bot lazima iwe admin
// ════════════════════════════════════════════════════════════════
export const demote = {
    name:        'demote',
    description: 'Ondoa admin wa group',
    category:    'group',
    use:         '@mention au reply',
    alias:       [],
    adminOnly:   true,

    async execute(sock, msg, args) {
        const chatJid = msg.key.remoteJid;
        if (!chatJid.endsWith('@g.us')) return reply(sock, msg, '*_Command hii ni ya group tu!_*');

        if (!await isBotAdmin(sock, chatJid)) {
            return reply(sock, msg, '*_Fanya bot admin kwanza!_*');
        }

        const mentioned  = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const quotedPart = msg.message?.extendedTextMessage?.contextInfo?.participant;
        const targets    = mentioned.length > 0 ? mentioned : quotedPart ? [normalizeJid(quotedPart)] : [];

        if (!targets.length) return reply(sock, msg, '*_Mention au reply mtu unayetaka kumondolea admin_*');

        try {
            await sock.groupParticipantsUpdate(chatJid, targets, 'demote');
            const names = targets.map(t => `+${t.replace('@s.whatsapp.net', '')}`).join(', ');
            return reply(sock, msg, `*_✅ Ameondolewa admin: ${names}_*`);
        } catch (e) {
            return reply(sock, msg, `*_❌ Imeshindwa: ${e.message}_*`);
        }
    }
};

// ════════════════════════════════════════════════════════════════
//   MUTE — Bot lazima iwe admin
// ════════════════════════════════════════════════════════════════
export const mute = {
    name:        'mute',
    description: 'Zuia wanachama kutuma messages',
    category:    'group',
    use:         '',
    alias:       ['lock'],
    adminOnly:   true,

    async execute(sock, msg, args) {
        const chatJid = msg.key.remoteJid;
        if (!chatJid.endsWith('@g.us')) return reply(sock, msg, '*_Command hii ni ya group tu!_*');

        if (!await isBotAdmin(sock, chatJid)) {
            return reply(sock, msg, '*_Fanya bot admin kwanza!_*');
        }

        try {
            await sock.groupSettingUpdate(chatJid, 'announcement');
            return reply(sock, msg, '*_🔇 Group imefungwa — admins peke yao waweze kutuma._*');
        } catch (e) {
            return reply(sock, msg, `*_❌ Imeshindwa: ${e.message}_*`);
        }
    }
};

// ════════════════════════════════════════════════════════════════
//   UNMUTE — Bot lazima iwe admin
// ════════════════════════════════════════════════════════════════
export const unmute = {
    name:        'unmute',
    description: 'Ruhusu wanachama wote kutuma messages',
    category:    'group',
    use:         '',
    alias:       ['unlock'],
    adminOnly:   true,

    async execute(sock, msg, args) {
        const chatJid = msg.key.remoteJid;
        if (!chatJid.endsWith('@g.us')) return reply(sock, msg, '*_Command hii ni ya group tu!_*');

        if (!await isBotAdmin(sock, chatJid)) {
            return reply(sock, msg, '*_Fanya bot admin kwanza!_*');
        }

        try {
            await sock.groupSettingUpdate(chatJid, 'not_announcement');
            return reply(sock, msg, '*_🔊 Group imefunguliwa — wote waweze kutuma._*');
        } catch (e) {
            return reply(sock, msg, `*_❌ Imeshindwa: ${e.message}_*`);
        }
    }
};

// ════════════════════════════════════════════════════════════════
//   DEFAULT EXPORT
// ════════════════════════════════════════════════════════════════
export default {
    join, newgc, ginfo, rejectall, acceptall, listrequest,
    setdesc, setname, left, gpp, tagall, broadcast,
    kick, promote, demote, mute, unmute
};
