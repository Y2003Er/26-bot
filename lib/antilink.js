/**
 * lib/antilink.js
 * Mfumo wa Anti-Link wa 26-TECH (Professional DM Warning Version)
 */

function normalizeJid(jid) {
    if (!jid) return '';
    return jid.replace(/:\d+@/, '@');
}

export async function handleAntiLink(sock, msg, logger) {
    try {
        const from = msg.key.remoteJid;
        
        // 1. Mfumo unafanya kazi kwenye magrupu tu
        if (!from.endsWith('@g.us')) return;

        // Kama ujumbe umetoka kwa Bot yenyewe, puuza
        if (msg.key.fromMe) return;

        // Pata maandishi ya ujumbe
        const text = msg.message?.conversation || 
                     msg.message?.extendedTextMessage?.text || 
                     msg.message?.imageMessage?.caption || 
                     msg.message?.videoMessage?.caption || '';

        // Regex ya kunasa link zote (ikiwemo za magrupu ya WhatsApp na link za kawaida za http/https)
        const linkRegex = /(https?:\/\/[^\s]+|chat\.whatsapp\.com\/[^\s]+|wa\.me\/[^\s]+)/gi;
        const hasLink = linkRegex.test(text);

        if (hasLink) {
            // 🔍 Kagua metadata ya kundi na ma-admin
            const groupMetadata = await sock.groupMetadata(from).catch(() => null);
            if (!groupMetadata) return;

            const botNumber = sock.user.id.replace(/:\d+@/, '@');
            
            // Kagua kama bot yenyewe ni admin (kama siyo admin haiwezi kufuta ujumbe)
            const botParticipant = groupMetadata.participants.find(p => p.id === botNumber);
            const isBotAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin';
            if (!isBotAdmin) return;

            // Pata JID ya aliyetuma ujumbe huo wenye link
            const sender = normalizeJid(msg.key.participant || msg.key.remoteJid);

            // Kagua kama aliyetuma ni admin wa kundi
            const participant = groupMetadata.participants.find(p => normalizeJid(p.id) === sender);
            const isSenderAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';

            // 🛑 Kama aliyetuma SIYO ADMIN, chukua hatua kimya kimya kwenye group lakini kali kwenye DM!
            if (!isSenderAdmin) {
                if (logger && logger.warn) {
                    logger.warn(`⚠️ Link imegunduliwa kutoka kwa: ${sender} kwenye group [${groupMetadata.subject}]`);
                }

                // 🟥 HATUA YA 1: Futa ule ujumbe wenye link mara moja kwenye group
                // ✅ FIX — { delete: msg.key } peke yake haifanyi kazi kwenye group messages.
                // Baileys inahitaji key kamili yenye remoteJid ya group, fromMe: false,
                // na participant (JID ya aliyetuma) — bila participant, delete inashindwa
                // kimya kimya bila kutoa error yoyote.
                await sock.sendMessage(from, {
                    delete: {
                        remoteJid:   from,
                        fromMe:      false,
                        id:          msg.key.id,
                        participant: msg.key.participant
                    }
                });

                // 📬 HATUA YA 2: Tuma onyo kali la faragha moja kwa moja kwenye DM yake
                const groupName = groupMetadata.subject;
                await sock.sendMessage(sender, {
                    text: `🚷 *26-TECH SUITE PROTECTION*\n\n` +
                          `Habari, ujumbe wako uliotuma hivi punde kwenye kikundi cha *${groupName}* umefutwa kiotomatiki kwa sababu *HAURUHUSIWI* kutuma link kwenye kikundi hicho.\n\n` +
                          `⚠️ *Onyo:* Tafadhali zingatia sheria za kikundi ili kuepuka kuondolewa (kick) kabisa.`
                });
            }
        }
    } catch (error) {
        if (error.message?.includes('403') || error.message?.includes('cannot send')) {
            // Hii inasaidia kama mtu ameblock boti au ana privacy ya DM zisizo marafiki, isigongeshe mfumo mzima
            if (logger && logger.warn) logger.warn(`⚠️ Imeshindwa kutuma DM ya onyo kwa ${msg.key.participant}: Privacy restriction.`);
        } else if (logger && logger.error) {
            logger.error(`Hitilafu kwenye Anti-Link: ${error.message}`);
        }
    }
}
