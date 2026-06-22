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
export const ownerOnly   = true; // Owner peke yake — usalama wa account

// Owner JID kutoka .env
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

    // ── Owner peke yake — DM au Group ──
    // Jibu kimya kimya — usimwambie mtu kwamba command ipo
    if (!isOwner(msg)) return;

    // Group tu
    if (!from.endsWith('@g.us')) {
        return sock.sendMessage(from, {
            text: '*_Command hii ni ya group tu!_*'
        }, { quoted: msg });
    }

    try {
        const meta         = await sock.groupMetadata(from);
        const participants = meta.participants || [];

        // Tenganisha superadmins na admins
        const superAdmins = participants.filter(p => p.admin === 'superadmin');
        const admins      = participants.filter(p => p.admin === 'admin');
        const allAdmins   = [...superAdmins, ...admins];

        if (!allAdmins.length) {
            return sock.sendMessage(from, {
                text: '*_Hakuna admin kwenye group hii!_*'
            }, { quoted: msg });
        }

        // Jenga ujumbe
        let text  = `╔═══════════════════════╗\n`;
        text     += `║  🛡️  *GROUP ADMINS*    ║\n`;
        text     += `╚═══════════════════════╝\n\n`;
        text     += `👥 *Group:* ${meta.subject}\n`;
        text     += `📊 *Admins:* ${allAdmins.length}/${participants.length}\n\n`;

        // Superadmins kwanza (group creator)
        if (superAdmins.length) {
            text += `👑 *Super Admin:*\n`;
            for (const p of superAdmins) {
                const num = p.id.replace('@s.whatsapp.net', '').replace('@c.us', '');
                text += `  • @${num}\n`;
            }
            text += `\n`;
        }

        // Admins wa kawaida
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
export function initGroupProtection(sock, logger) {
    sock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action, author } = update;
        
        // ✅ FIX 1 — botNumber ilikuwa ikivunja JID kwa kuondoa @s.whatsapp.net
        // kisha kuiongeza tena — matokeo ilikuwa JID mbaya isiyofanana na yoyote.
        // sock.user.id tayari ina format "2557xx:xx@s.whatsapp.net" —
        // tunafuta ":xx" tu, tunaacha "@s.whatsapp.net" kama ilivyo.
        const botNumber  = sock.user.id.replace(/:\d+@/, '@'); // ✅ FIXED

        const superAdmin = normalizeJid(OWNER_JID);

        // Kama aliyeleta mabadiliko ni Bot au ni hatua ya kawaida ya kuongeza watu, simama.
        if (author === botNumber || action === 'add' || action === 'promote') return;

        try {
            // Kagua kama bot ni admin ili kuzuia makosa ya permissions
            const groupMetadata = await sock.groupMetadata(id).catch(() => null);
            if (!groupMetadata) return;
            
            const botParticipant = groupMetadata.participants.find(p => p.id === botNumber);
            const isBotAdmin     = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin';

            if (!isBotAdmin) return;

            // Walengwa wanaolindwa na huu mfumo (Wewe + Bot)
            const targetsProtected = [superAdmin, botNumber];

            // ✅ FIX 2 — participants ni array ya JID strings, si objects.
            // .includes(p) ilikuwa ikishindwa kwa sababu haikufanya normalize kwanza —
            // JID kama "2557xx:xx@s.whatsapp.net" haikuwa inafanana na "2557xx@s.whatsapp.net".
            // Sasa tunafanya normalizeJid(p) kabla ya kulinganisha.
            const affectedTarget = participants.find(p => targetsProtected.includes(normalizeJid(p))); // ✅ FIXED

            if (affectedTarget) {
                // 🛑 1. ANTI-KICK (Ulinzi wa kutolewa)
                if (action === 'remove') {
                    if (logger && logger.warn) {
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

                // 📉 2. ANTI-DEMOTE (Ulinzi wa kushushwa cheo)
                if (action === 'demote') {
                    if (logger && logger.warn) {
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
            if (logger && logger.error) {
                logger.error(`Critical error kwenye ulinzi wa kundi: ${criticalError.message}`);
            }
        }
    });
}
