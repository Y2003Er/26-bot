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
