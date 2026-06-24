// lib/antilink.js — FIXED v2.0 by 26-TECH
// FIX C-13: Tumia groupMetaCache iliyopitishwa badala ya
// kufanya groupMetadata() fetch binafsi kwa kila ujumbe wa link.
// Ilikuwa: fetch mpya kila wakati = double network call na handler
// Sasa: cache ya pamoja = fetch moja tu kwa group kwa dakika 5

import { groupMetaCache } from './handler.js';

function normalizeJid(jid) {
    if (!jid) return '';
    return jid.replace(/:\d+@/, '@');
}

export async function handleAntiLink(sock, msg, logger) {
    try {
        const from = msg.key.remoteJid;

        // Mfumo unafanya kazi kwenye magrupu tu
        if (!from.endsWith('@g.us')) return;

        // Kama ujumbe umetoka kwa Bot yenyewe, puuza
        if (msg.key.fromMe) return;

        // Pata maandishi ya ujumbe
        const text = msg.message?.conversation ||
                     msg.message?.extendedTextMessage?.text ||
                     msg.message?.imageMessage?.caption ||
                     msg.message?.videoMessage?.caption || '';

        const linkRegex = /(https?:\/\/[^\s]+|chat\.whatsapp\.com\/[^\s]+|wa\.me\/[^\s]+)/gi;
        const hasLink = linkRegex.test(text);

        if (hasLink) {
            // ════════════════════════════════════════════════════════
            // FIX C-13: Tumia groupMetaCache iliyoexportwa na handler
            // Badala ya: sock.groupMetadata(from) — network call mpya
            // Sasa: angalia cache kwanza, fetch tu kama haipo
            // Handler pia inatumia cache hii hiyo — kwa hivyo kama
            // handler alishafetch, antilink inapata bure kabisa
            // ════════════════════════════════════════════════════════
            let groupMetadata = groupMetaCache.get(from);
            if (!groupMetadata) {
                groupMetadata = await sock.groupMetadata(from).catch(() => null);
                if (groupMetadata) groupMetaCache.set(from, groupMetadata);
            }
            if (!groupMetadata) return;

            const botNumber = sock.user.id.replace(/:\d+@/, '@');

            // Kagua kama bot ni admin
            const botParticipant = groupMetadata.participants.find(p => p.id === botNumber);
            const isBotAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin';
            if (!isBotAdmin) return;

            // Pata JID ya aliyetuma
            const sender = normalizeJid(msg.key.participant || msg.key.remoteJid);

            // Kagua kama aliyetuma ni admin
            const participant = groupMetadata.participants.find(p => normalizeJid(p.id) === sender);
            const isSenderAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';

            if (!isSenderAdmin) {
                if (logger?.warn) {
                    logger.warn(`⚠️ Link imegunduliwa kutoka kwa: ${sender} kwenye group [${groupMetadata.subject}]`);
                }

                // Futa ujumbe wenye link
                await sock.sendMessage(from, {
                    delete: {
                        remoteJid:   from,
                        fromMe:      false,
                        id:          msg.key.id,
                        participant: msg.key.participant
                    }
                });

                // Tuma onyo kwa DM
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
            if (logger?.warn) logger.warn(`⚠️ Imeshindwa kutuma DM ya onyo kwa ${msg.key.participant}: Privacy restriction.`);
        } else if (logger?.error) {
            logger.error(`Hitilafu kwenye Anti-Link: ${error.message}`);
        }
    }
}