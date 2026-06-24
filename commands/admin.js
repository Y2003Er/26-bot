/**
 * commands/admin.js
 * Orodha ya admins wote wa group
 * ownerOnly: true — owner peke yake anaweza kuitumia
 */

export const name        = 'admin';
export const description = 'Orodha ya admins wote wa group';
export const category    = 'group';
export const use         = '';
export const alias       = ['admins', 'getadmin'];
export const adminOnly   = false;
export const ownerOnly   = true;

const RAW_OWNER = (process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, '');
const OWNER_JID = `${RAW_OWNER}@s.whatsapp.net`;

function normalizeJid(jid) {
    if (!jid) return '';
    return jid.replace(/:\d+@/, '@');
}

function isOwner(msg) {
    const isGroup  = msg.key.remoteJid?.endsWith('@g.us');
    const isFromMe = msg.key.fromMe === true;
    const sender   = normalizeJid(isGroup ? (msg.key.participant || '') : msg.key.remoteJid);
    return sender === normalizeJid(OWNER_JID) || (isGroup && isFromMe);
}

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;

    if (!isOwner(msg)) return;

    if (!from.endsWith('@g.us')) {
        return sock.sendMessage(from, {
            text: '*_Command hii ni ya group tu!_*'
        }, { quoted: msg });
    }

    try {
        const meta         = await sock.groupMetadata(from);
        const participants = meta.participants || [];

        const superAdmins = participants.filter(p => p.admin === 'superadmin');
        const admins      = participants.filter(p => p.admin === 'admin');
        const allAdmins   = [...superAdmins, ...admins];

        if (!allAdmins.length) {
            return sock.sendMessage(from, {
                text: '*_Hakuna admin kwenye group hii!_*'
            }, { quoted: msg });
        }

        let text  = `╔═══════════════════════╗\n`;
        text     += `║  🛡️  *GROUP ADMINS*    ║\n`;
        text     += `╚═══════════════════════╝\n\n`;
        text     += `👥 *Group:* ${meta.subject}\n`;
        text     += `📊 *Admins:* ${allAdmins.length}/${participants.length}\n\n`;

        if (superAdmins.length) {
            text += `👑 *Super Admin:*\n`;
            for (const p of superAdmins) {
                const num = p.id.replace('@s.whatsapp.net', '').replace('@c.us', '');
                text += `  • @${num}\n`;
            }
            text += `\n`;
        }

        if (admins.length) {
            text += `🛡️ *Admins (${admins.length}):*\n`;
            for (const p of admins) {
                const num = p.id.replace('@s.whatsapp.net', '').replace('@c.us', '');
                text += `  • @${num}\n`;
            }
        }

        text += `\n_⚡ 26-TECH_`;

        await sock.sendMessage(from, {
            text,
            mentions: allAdmins.map(p => p.id)
        }, { quoted: msg });

    } catch (e) {
        await sock.sendMessage(from, {
            text: `*_❌ Imeshindwa kupata admins: ${e.message}_*`
        }, { quoted: msg });
    }
}

// ════════════════════════════════════════════════
// 🛡️ MFUMO WA ULINZI WA KIMAFIA (ANTI-KICK & ANTI-DEMOTE)
// ════════════════════════════════════════════════

// ✅ FIX M-5: Pokea groupMetaCache kutoka handler
export function initGroupProtection(sock, logger, groupMetaCache = null) {
    sock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action, author } = update;

        const botNumber  = sock.user.id.replace(/:\d+@/, '@');
        const superAdmin = normalizeJid(OWNER_JID);

        if (author === botNumber || action === 'add' || action === 'promote') return;

        try {
            // ✅ FIX M-5: Tumia cache kama ipo, vinginevyo fetch
            let groupMetadata = groupMetaCache ? groupMetaCache.get(id) : null;
            if (!groupMetadata) {
                groupMetadata = await sock.groupMetadata(id).catch(() => null);
                if (groupMetadata && groupMetaCache) {
                    groupMetaCache.set(id, groupMetadata);
                }
            }
            if (!groupMetadata) return;

            const botParticipant = groupMetadata.participants.find(p => p.id === botNumber);
            const isBotAdmin     = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin';

            if (!isBotAdmin) return;

            const targetsProtected = [superAdmin, botNumber];
            const affectedTarget = participants.find(p => targetsProtected.includes(normalizeJid(p)));

            if (affectedTarget) {
                if (action === 'remove') {
                    if (logger?.warn) {
                        logger.warn(`⚠️ Mapinduzi! Admin ${author} amemtoa @${affectedTarget.split('@')[0]}`);
                    }

                    await sock.groupParticipantsUpdate(id, [affectedTarget], 'add');
                    await sock.groupParticipantsUpdate(id, [author], 'demote');
                    await sock.groupParticipantsUpdate(id, [author], 'remove');

                    await sock.sendMessage(id, {
                        text: `🛡️ *26-TECH SUITE PROTECTION*\n\n` +
                              `❌ Admin @${author.split('@')[0]} amepigwa *BANNED + KICK* ya kiotomatiki baada ya kujaribu kufanya mapinduzi dhidi ya mfumo wa utawala.`,
                        mentions: [author]
                    });
                }

                if (action === 'demote') {
                    if (logger?.warn) {
                        logger.warn(`⚠️ Jaribio la Demotion kutoka kwa ${author} dhidi ya @${affectedTarget.split('@')[0]}`);
                    }

                    await sock.groupParticipantsUpdate(id, [affectedTarget], 'promote');
                    await sock.groupParticipantsUpdate(id, [author], 'demote');

                    await sock.sendMessage(id, {
                        text: `❌ *Ulinzi wa 26 Tech:* Admin @${author.split('@')[0]} amepokonywa madaraka baada ya kujaribu kumshusha cheo Kiongozi Mkuu.`,
                        mentions: [author]
                    });
                }
            }
        } catch (criticalError) {
            if (logger?.error) {
                logger.error(`Critical error kwenye ulinzi wa kundi: ${criticalError.message}`);
            }
        }
    });
}