// commands/group.js
// ════════════════════════════════════════════════════════════════
//   FIXES:
//   [1] Hardcoded number imeondolewa kwenye tagall
//   [2] send() helper imesahihishwa — inatumia m.bot.sendMessage moja kwa moja
//   [3] downloadMediaMessage → m.downloadMedia() ambayo ipo kwenye buildContext
//   [4] groupInvite detection imeboreshwa
//   [5] broadcast send kwa jid imesahihishwa
// ════════════════════════════════════════════════════════════════

import {
    updateProfilePicture,
    parsedJid
} from '../lib/handler.js';

import {
    prefix,
    packname,
    author
} from '../config.js';

import astro_patch from '../lib/plugins.js';
const { cmd, smd } = astro_patch;

const Config = {
    caption: `*${packname || '26-TECH'}* | _${author || 'Bot'}_`
};

// ── Helpers ──
const tlang = () => ({
    group: '*_This command is for groups only!_*',
    admin: '*_You or I must be admin to use this!_*',
    owner: '*_This command is for owner only!_*'
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getAdmin = (participants) =>
    participants
        .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
        .map(p => p.id);

// FIX #2 — send() helper iliyosahihishwa
// Inatumia m.bot.sendMessage moja kwa moja badala ya m.send()
// Inashughulikia: send(m, text) na send(m, text, opts, '', '', jid)
const send = async (m, text, options = {}, _a = '', _b = '', jid = null) => {
    const chatId = jid || m.chat;
    return await m.bot.sendMessage(chatId, { text, ...options });
};

const grouppattern = /https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{22}/g;

// ====================== JOIN ======================
smd({
    cmdname: 'join',
    info: 'joins group by link',
    type: 'whatsapp',
    fromMe: true,
    filename: import.meta.url,
    use: '<group link>'
}, async (m, text) => {
    try {
        // FIX #4 — groupInvite detection imeboreshwa
        const quotedMsg = m.quoted?.msg;
        if (quotedMsg?.groupInviteMessage) {
            const joined = await m.bot.groupAcceptInviteV4(m.chat, quotedMsg.groupInviteMessage);
            if (joined) return await m.reply('*_Joined_*');
        }

        const linkText = text || m.reply_text || '';
        const match    = linkText.match(grouppattern);
        if (!match) return await m.reply('*_Please provide a group link_*');

        const code = match[0].split('https://chat.whatsapp.com/')[1].trim();
        await m.bot.groupAcceptInvite(code);
        return await m.reply('*_Joined_*');

    } catch (e) {
        await m.error(`join error: ${e.message}`, e, "*_Can't join, group not found!_*");
    }
});

// ====================== NEWGC ======================
smd({
    cmdname: 'newgc',
    info: 'Create new group',
    type: 'whatsapp',
    filename: import.meta.url,
    use: '<group name>'
}, async (m, text, { cmdName }) => {
    try {
        if (!m.isCreator) return m.reply(tlang().owner);
        if (!text) return await m.reply(`*_Provide a name to create a new group!_*\n*_Ex: ${prefix + cmdName} My Group @user_*`);

        if (text.toLowerCase() === 'info') {
            return await m.reply(`*Create new Group command*\n\`\`\`Ex: ${prefix + cmdName} My New Group\`\`\`\n\n*You can also add people*\n\`\`\`just reply or mention users\`\`\``);
        }

        let participants = [m.sender];
        if (m.quoted?.sender) participants.push(m.quoted.sender);
        if (m.mentionedJid?.length) participants.push(...m.mentionedJid);

        const groupName = text.substring(0, 60);
        const created   = await m.bot.groupCreate(groupName, [...new Set(participants)]);

        if (!created) return await m.reply('*_Cannot create group, sorry!_*');

        let inviteCode = '';
        try { inviteCode = await m.bot.groupInviteCode(created.id); } catch {}
        const link = inviteCode ? `https://chat.whatsapp.com/${inviteCode}` : '';

        await m.bot.sendMessage(created.id, {
            text: `*_Hey Master, Welcome to the new group!_*\n${Config.caption}`
        });

        const contextInfo = link ? {
            externalAdReply: {
                title: '26-𝚃𝙴𝙲𝙷',
                body: groupName,
                renderLargerThumbnail: true,
                mediaType: 1,
                mediaUrl: link,
                sourceUrl: link
            }
        } : {};

        return await m.reply(
            `*_Hurray! New group created!_*\n${link}`,
            Object.keys(contextInfo).length ? { contextInfo } : {}
        );

    } catch (e) {
        await m.error(`newgc error: ${e.message}`, e, "*_Can't create group, sorry!_*");
    }
});

// ====================== GINFO ======================
smd({
    pattern: 'ginfo',
    desc: 'Get group info by link',
    type: 'group',
    filename: import.meta.url,
    use: '<group link>'
}, async (m, text) => {
    try {
        const linkText = text || m.reply_text || '';
        const match    = linkText.match(grouppattern);
        if (!match) return await m.reply('*_Please provide a group link_*');

        const code = match[0].split('https://chat.whatsapp.com/')[1].trim();
        const info = await m.bot.groupGetInviteInfo(code);
        if (!info) return await m.reply('*_Group not found!_*');

        const created = new Date(info.creation * 1000).toISOString().split('T')[0];

        const contextInfo = {
            externalAdReply: {
                title: '26-𝚃𝙴𝙲𝙷',
                body: info.subject,
                renderLargerThumbnail: true,
                mediaType: 1,
                mediaUrl: match[0],
                sourceUrl: match[0]
            }
        };

        let msg = `*${info.subject}*\n\n`;
        msg    += `Creator: wa.me/${info.owner?.split('@')[0]}\n`;
        msg    += `GJid: \`\`\`${info.id}\`\`\`\n`;
        msg    += `*Muted:* ${info.announce ? 'yes' : 'no'}\n`;
        msg    += `*Locked:* ${info.restrict ? 'yes' : 'no'}\n`;
        msg    += `*Created:* ${created}\n`;
        msg    += `*Participants:* ${info.size}\n`;
        if (info.desc) msg += `*Description:* ${info.desc}\n`;
        msg    += `\n${Config.caption}`;

        return await m.reply(msg, { mentions: [info.owner], contextInfo });

    } catch (e) {
        await m.error(`ginfo error: ${e.message}`, e, '*_Group not found!_*');
    }
});

// ====================== REJECTALL ======================
smd({
    cmdname: 'rejectall',
    alias: ['rejectjoin'],
    info: 'Reject all join requests',
    type: 'group',
    filename: import.meta.url
}, async (m) => {
    try {
        if (!m.isGroup) return m.reply(tlang().group);
        if (!m.isBotAdmin || !m.isAdmin) {
            return m.reply(!m.isBotAdmin ? "*_I'm not admin in this group_*" : tlang().admin);
        }

        const requests = await m.bot.groupRequestParticipantsList(m.chat);
        if (!requests?.length) return await m.reply('*_No join requests_*');

        let rejected = [];
        let msg      = '*Rejected users:*\n\n';

        for (const req of requests) {
            try {
                await m.bot.groupRequestParticipantsUpdate(m.chat, [req.jid], 'reject');
                msg      += `@${req.jid.split('@')[0]}\n`;
                rejected.push(req.jid);
            } catch {}
        }

        await m.reply(msg, { mentions: rejected });

    } catch (e) {
        await m.error(`rejectall error: ${e.message}`, e);
    }
});

// ====================== ACCEPTALL ======================
smd({
    cmdname: 'acceptall',
    alias: ['acceptjoin'],
    info: 'Accept all join requests',
    type: 'group',
    filename: import.meta.url
}, async (m) => {
    try {
        if (!m.isGroup) return m.reply(tlang().group);
        if (!m.isBotAdmin || !m.isAdmin) {
            return m.reply(!m.isBotAdmin ? "*_I'm not admin in this group_*" : tlang().admin);
        }

        const requests = await m.bot.groupRequestParticipantsList(m.chat);
        if (!requests?.length) return await m.reply('*_No join requests_*');

        let accepted = [];
        let msg      = '*Accepted users:*\n\n';

        for (const req of requests) {
            try {
                await m.bot.groupRequestParticipantsUpdate(m.chat, [req.jid], 'approve');
                msg      += `@${req.jid.split('@')[0]}\n`;
                accepted.push(req.jid);
            } catch {}
        }

        await m.reply(msg, { mentions: accepted });

    } catch (e) {
        await m.error(`acceptall error: ${e.message}`, e);
    }
});

// ====================== LISTREQUEST ======================
smd({
    cmdname: 'listrequest',
    alias: ['requestjoin'],
    info: 'List all join requests',
    type: 'group',
    filename: import.meta.url
}, async (m) => {
    try {
        if (!m.isGroup) return m.reply(tlang().group);
        if (!m.isBotAdmin || !m.isAdmin) return m.reply(tlang().admin);

        const requests = await m.bot.groupRequestParticipantsList(m.chat);
        if (!requests?.length) return await m.reply('*_No join requests_*');

        let jids = [];
        let msg  = '*Users requesting to join:*\n\n';

        for (const req of requests) {
            msg += `@${req.jid.split('@')[0]}\n`;
            jids.push(req.jid);
        }

        return await m.reply(msg, { mentions: jids });

    } catch (e) {
        await m.error(`listrequest error: ${e.message}`, e);
    }
});

// ====================== SETDESC ======================
smd({
    cmdname: 'setdesc',
    alias: ['setgdesc', 'gdesc'],
    info: 'Set group description',
    type: 'group',
    filename: import.meta.url,
    use: '<description text>'
}, async (m, text) => {
    try {
        if (!m.isGroup) return m.reply(tlang().group);
        if (!text)      return await m.reply('*Provide description text*');
        if (!m.isBotAdmin || !m.isAdmin) return m.reply(tlang().admin);

        await m.bot.groupUpdateDescription(m.chat, `${text}\n\n\t${Config.caption}`);
        return await m.reply('*_✅ Group description updated!_*');

    } catch (e) {
        await m.error(`setdesc error: ${e.message}`, e);
    }
});

// ====================== SETNAME ======================
smd({
    cmdname: 'setname',
    alias: ['setgname', 'gname'],
    info: 'Set group name',
    type: 'group',
    filename: import.meta.url,
    use: '<name>'
}, async (m, text) => {
    try {
        if (!m.isGroup) return m.reply(tlang().group);
        if (!text)      return await m.reply('*Provide a name*');
        if (!m.isBotAdmin || !m.isAdmin) return m.reply(tlang().admin);

        await m.bot.groupUpdateSubject(m.chat, text);
        return await m.reply('*_✅ Group name updated!_*');

    } catch (e) {
        await m.error(`setname error: ${e.message}`, e);
    }
});

// ====================== LEFT ======================
smd({
    cmdname: 'left',
    info: 'Leave a group',
    fromMe: true,
    type: 'group',
    filename: import.meta.url
}, async (m, text) => {
    try {
        if (!m.isGroup) return m.reply(tlang().group);

        const confirm = (text || '').toLowerCase().trim();
        if (confirm.match(/^(sure|yes|ok)$/)) {
            await m.bot.groupParticipantsUpdate(m.chat, [m.user], 'remove');
            return await m.reply('*Group left!*');
        }
        return await m.reply(`*_Use: ${prefix}left sure/yes/ok_*`);

    } catch (e) {
        await m.error(`left error: ${e.message}`, e);
    }
});

// ====================== GPP ======================
smd({
    pattern: 'gpp',
    desc: 'Set group profile picture',
    category: 'group',
    filename: import.meta.url
}, async (m) => {
    try {
        if (!m.isGroup) return m.reply(tlang().group);
        if (!m.isBotAdmin || !m.isAdmin) return m.reply(tlang().admin);

        // Tumia picha iliyotumwa au quoted
        const source = m.mtype === 'imageMessage' ? m : m.quoted;
        if (!source || source.mtype !== 'imageMessage') {
            return m.reply('*Reply to an image*');
        }

        return await updateProfilePicture(m, m.chat, source, 'gpp');

    } catch (e) {
        await m.error(`gpp error: ${e.message}`, e);
    }
});

// ====================== FULLGPP ======================
smd({
    pattern: 'fullgpp',
    desc: 'Set full screen group profile picture',
    category: 'group',
    filename: import.meta.url
}, async (m) => {
    try {
        if (!m.isGroup) return m.reply(tlang().group);
        if (!m.isBotAdmin || !m.isAdmin) return m.reply(tlang().admin);

        const source = m.mtype === 'imageMessage' ? m : m.quoted;
        if (!source || source.mtype !== 'imageMessage') {
            return m.reply('*Reply to an image*');
        }

        return await updateProfilePicture(m, m.chat, source, 'fullgpp');

    } catch (e) {
        await m.error(`fullgpp error: ${e.message}`, e);
    }
});

// ====================== TAGALL ======================
cmd({
    pattern: 'tagall',
    desc: 'Tag all group members',
    category: 'group',
    filename: import.meta.url
}, async (m, text) => {
    try {
        if (!m.isGroup) return m.reply(tlang().group);
        if (!m.isAdmin && !m.isCreator) return m.reply(tlang().admin);

        const participants = m.metadata?.participants || [];
        // FIX #1 — Hardcoded number imeondolewa kabisa
        let   tagText      = `\n══✪〘 *Tag All* 〙✪══\n\n`;
        tagText           += `➲ *Message:* ${text || 'blank'}\n`;
        tagText           += `${Config.caption}\n\n`;
        tagText           += `➲ *Author:* ${m.pushName} 🔖\n\n`;

        for (const p of participants) {
            tagText += `📍 @${p.id.split('@')[0]}\n`;
        }

        await m.bot.sendMessage(
            m.chat,
            { text: tagText, mentions: participants.map(p => p.id) },
            { quoted: m.raw }
        );

    } catch (e) {
        await m.error(`tagall error: ${e.message}`, e);
    }
});

// ====================== BROADCAST ======================
cmd({
    pattern: 'broadcast',
    desc: 'Broadcast message to all groups',
    fromMe: true,
    category: 'group',
    filename: import.meta.url
}, async (m, text) => {
    try {
        if (!text) return await m.reply('*_Provide text for broadcast_*');

        const groups = await m.bot.groupFetchAllParticipating();
        const ids    = Object.keys(groups);

        await m.reply(`*_Sending broadcast to ${ids.length} groups..._*`);

        for (const id of ids) {
            try {
                await sleep(1500);
                // FIX #5 — Tuma moja kwa moja kwa kila group jid
                await m.bot.sendMessage(id, {
                    text: `*--❗ 26-𝚃𝙴𝙲𝙷 Broadcast ❗--*\n\n*🍀 Message:* ${text}`
                });
            } catch {}
        }

        return await m.reply(`*_Broadcast sent to ${ids.length} groups_*`);

    } catch (e) {
        await m.error(`broadcast error: ${e.message}`, e);
    }
});

export default {};
