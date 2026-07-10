// commands/ai.js — FIXED v2.1 by 26-TECH
// FIX C-2: Tumia shared pool kutoka lib/db.js
// FIX C-5: saveConversation inakubali history iliyopo
// FIX C-6: typingDelay imepunguzwa
// ✅ FIX D-1: Prefix dynamic kutoka config — siyo hardcoded '.'
// ✅ FIX D-2: Regex ina-built dynamically badala ya hardcoded

import dotenv from 'dotenv';
dotenv.config();
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import { GoogleGenAI } from '@google/genai';
import { prefix as configuredPrefix } from '../config.js';
import { getPool } from '../lib/db.js';
const pool = getPool();
const logger = pino({ level: 'silent' });
const MAX_HISTORY = 20;

// ✅ FIX D-1: Dynamic prefix helper
const getPrefix = () => global.prefix || configuredPrefix || '.';

// ✅ FIX D-2: Build regex dynamically
function getAiRegex() {
    const pfx = getPrefix();
    const escapedPfx = pfx.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escapedPfx}(ai|bot)\\s*`, 'i');
}

function getPhotoRegex() {
    const pfx = getPrefix();
    const escapedPfx = pfx.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escapedPfx}photo`, 'i');
}

// ═══════════════ [KEEP ALL EXISTING CODE UNCHANGED UNTIL execute()] ═══════════════

export async function execute(sock, msg, args) {
    try {
        const from = msg?.key?.remoteJid;
        if (!from) return false;

        const sender   = msg.key.participant || from;
        const fullText = (
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            ''
        ).trim();

        // ✅ FIX D-2: Tumia dynamic photo check
        const photoRegex = getPhotoRegex();
        if (photoRegex.test(fullText)) {
            const commandText = fullText.replace(photoRegex, '').trim();
            return await handlePhoto(sock, msg, from, `${getPrefix()}photo ${commandText}`);
        }

        const hasAudio =
            !!msg.message?.audioMessage ||
            !!msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage;

        if (hasAudio) {
            return await handleVoiceNote(sock, msg, from, sender);
        }

        const hasImage =
            !!msg.message?.imageMessage ||
            !!msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

        if (hasImage) {
            const aiRegex = getAiRegex();
            const imageCaption =
                msg.message?.imageMessage?.caption ||
                fullText.replace(aiRegex, '').trim() ||
                '';
            return await handleImageAnalysis(sock, msg, from, sender, imageCaption);
        }

        if (!fullText) return false;

        const contextInfo       = msg.message?.extendedTextMessage?.contextInfo;
        const quotedParticipant = contextInfo?.participant || '';
        const quotedStanzaId    = contextInfo?.stanzaId   || '';

        const botId        = sock?.user?.id  || '';
        const botLid       = sock?.user?.lid || '';
        const botNumber    = botId.replace(/:.*@/, '').replace(/@.*/, '');
        const botLidNumber = botLid.replace(/:.*@/, '').replace(/@.*/, '');

        const isDM           = !from.endsWith('@g.us');
        const isReplyInDM    = isDM && !!quotedStanzaId;
        const isReplyInGroup = Boolean(
            (botNumber    && quotedParticipant.includes(botNumber))    ||
            (botLidNumber && quotedParticipant.includes(botLidNumber))
        );
        const isReplyToBot = isReplyInDM || isReplyInGroup;

        // ✅ FIX D-2: Tumia dynamic prefix check
        const aiRegex = getAiRegex();
        const hasPrefix = aiRegex.test(fullText);

        if (!hasPrefix && !isReplyToBot) return false;

        // ✅ FIX D-2: Tumia dynamic prefix extraction
        let query = fullText.replace(aiRegex, '').trim();
        if (isReplyToBot && !hasPrefix) query = fullText;

        if (!query) {
            const pfx = getPrefix();
            await sock.sendMessage(from,
                { text: `💬 Tumia: *${pfx}ai swali lako*\nAu tuma picha/voice note — nitaichakata!` },
                { quoted: msg }
            );
            return true;
        }

        try {
            await sock.sendPresenceUpdate('composing', from);

            const history  = await getHistory(sender);
            const messages = [
                { role: 'system', content: SYSTEM },
                ...history,
                { role: 'user',   content: query }
            ];

            const reply = await aiRouter(messages);
            if (!reply) throw new Error('Jibu la router limekuja tupu kabisa');

            const typingDelay = Math.min(reply.length * 8, 1200);
            await new Promise(resolve => setTimeout(resolve, typingDelay));

            await saveConversation(sender, query, reply, history);

            await sock.sendMessage(from, { text: `🤖 *26 Tech AI*\n\n${reply}` }, { quoted: msg });

        } catch (err) {
            logger.error('Text AI inner logic error:', err.message);
            await sock.sendMessage(from, { text: `❌ AI imeshindwa: ${err.message}` }, { quoted: msg });
        } finally {
            await sock.sendPresenceUpdate('paused', from).catch(() => {});
        }

        return true;
    } catch (criticalErr) {
        logger.error('CRITICAL TOP-LEVEL CRASH PREVENTED in execute():', criticalErr.message);
        return false;
    }
}