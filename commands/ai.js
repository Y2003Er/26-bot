// commands/ai.js
// ════════════════════════════════════════════════════════════════
//   FIXES:
//   [1] Routing ya prefix/reply detection imeondolewa — handler.js
//       ndiyo inaamua lini ai.execute() iitwe
//   [2] Query extraction imesahihishwa — inafanya kazi kwa
//       prefix (.ai/.bot), reply, na group mentions
//   [3] Photo command pia inatumia handler routing
// ════════════════════════════════════════════════════════════════

'use strict';

import dotenv from 'dotenv';
dotenv.config();
import { Pool } from 'pg';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import pino from 'pino';

// Singleton PostgreSQL Pool
global.dbPool ||= new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});
const pool = global.dbPool;

const MAX_HISTORY  = 20;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const logger = pino({ level: 'info' });

// ════════════════════════════════════════════════
//   🧠 MEMORY — PostgreSQL
// ════════════════════════════════════════════════
async function initMemoryTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ai_memory (
            user_id TEXT PRIMARY KEY,
            history JSONB NOT NULL DEFAULT '[]'
        )
    `);
}
initMemoryTable().catch(err => logger.error('Memory table init error:', err));

async function getHistory(userId) {
    try {
        const res = await pool.query(
            'SELECT history FROM ai_memory WHERE user_id = $1',
            [userId]
        );
        return res.rows[0]?.history || [];
    } catch {
        return [];
    }
}

async function saveConversation(userId, userMsg, aiMsg) {
    try {
        const history = await getHistory(userId);
        history.push(
            { role: 'user',      content: userMsg },
            { role: 'assistant', content: aiMsg   }
        );
        const trimmed = history.slice(-MAX_HISTORY);
        await pool.query(`
            INSERT INTO ai_memory (user_id, history)
            VALUES ($1, $2)
            ON CONFLICT (user_id) DO UPDATE
            SET history = EXCLUDED.history
        `, [userId, JSON.stringify(trimmed)]);
    } catch (e) {
        logger.error('saveConversation error:', e.message);
    }
}

// ════════════════════════════════════════════════
//   ⚡ AI PROVIDERS
// ════════════════════════════════════════════════
async function callGroq(messages) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model:       'llama-3.3-70b-versatile',
                messages,
                temperature: 0.3,
                max_tokens:  2048
            }),
            signal: controller.signal
        });
        if (!res.ok) throw new Error(`Groq failed: ${res.status}`);
        const data = await res.json();
        return data.choices?.[0]?.message?.content;
    } finally {
        clearTimeout(timer);
    }
}

async function callGemini(messages) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
        const systemMsg = messages.find(m => m.role === 'system')?.content || '';
        const turns     = messages.filter(m => m.role !== 'system');

        const contents = turns.map(m => ({
            role:  m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemMsg }] },
                    contents,
                    generationConfig: {
                        temperature:     0.7,
                        maxOutputTokens: 2048
                    }
                }),
                signal: controller.signal
            }
        );
        if (!res.ok) {
            const err = await res.json();
            throw new Error(`Gemini failed: ${res.status} — ${err.error?.message || ''}`);
        }
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text;
    } finally {
        clearTimeout(timer);
    }
}

async function aiRouter(messages) {
    if (GROQ_API_KEY) {
        try {
            return await callGroq(messages);
        } catch (e) {
            logger.warn('Groq failed, trying Gemini:', e.message);
        }
    }
    if (GEMINI_API_KEY) {
        return await callGemini(messages);
    }
    throw new Error('Hakuna API key — weka GROQ_API_KEY au GEMINI_API_KEY');
}

// ════════════════════════════════════════════════
//   🤖 SYSTEM PROMPT
// ════════════════════════════════════════════════
const SYSTEM = `Wewe ni 26 Tech AI, iliyoundwa na 26 Tech Solution (Yuzzo).

Una akili ya kweli — unaelewa context, hisia, na nia ya mtu bila kufafanuliwa.
Jibu kama AI halisi, siyo roboti — kama mtu mwenye akili, mantiki, na uelewa wa hali halisi.
Tambua muktadha na hisia za mtumiaji, jibu kwa kina pale inapohitajika bila mipaka ya muda.

Kanuni za kujibu:
- Jibu kwa urefu unaofaa
- Usibane wala usipanue bila sababu — acha jibu liwe la asili
- Swali rahisi lijibiwe moja kwa moja bila ziada
- Swali gumu lijibiwe kwa kina na maelezo ya kutosha
- Mtu akionyesha hisia, zielewe kwanza kabla ya kujibu
- Jibu moja bora tu — usitoe chaguzi bila kuombwa
- Uliza swali moja tu ukihitaji kufafanua, si maswali mengi

MARUFUKU kabisa:
- Orodha au mifano bila kuombwa
- Maneno: "Bila shaka", "Hakika", "Kama AI", "Nimeprogramiwa", "Mimi ni asistenti"
- Kujielezea bila kuulizwa
- Kutoa chaguzi nyingi bila kuombwa

Ukiulizwa utambulisho wako → jibu fupi tu: "Mimi ni 26 Tech AI."
Ukiulizwa uwezo wako → eleza kwa sentensi 1-2 tu, si orodha.

Jibu kwa lugha ile ile ya mtumiaji — Kiswahili, English, au mchanganyiko.
Jibu fupi iwezekanavyo — ongeza tu pale inahitajika kweli kweli.`;

// ════════════════════════════════════════════════
//   🖼️ PHOTO EDITOR
// ════════════════════════════════════════════════
async function handlePhoto(sock, msg, from, commandText) {
    let sharp;
    try {
        sharp = (await import('sharp')).default;
    } catch {
        await sock.sendMessage(from, {
            text: '❌ sharp haipo — run: npm install sharp'
        }, { quoted: msg });
        return;
    }

    // Tumia picha iliyotumwa au quoted
    const imageMsg =
        msg.message?.imageMessage ||
        msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

    if (!imageMsg) {
        await sock.sendMessage(from, {
            text: '📸 Tuma picha pamoja na command:\n' +
                  '*.photo blur*    — blur\n' +
                  '*.photo gray*    — grayscale\n' +
                  '*.photo rotate*  — rotate 90°\n' +
                  '*.photo enhance* — resize/sharpen'
        }, { quoted: msg });
        return;
    }

    const type = commandText.replace(/^\.photo\s*/i, '').trim().toLowerCase() || 'enhance';

    try {
        const stream = await downloadContentFromMessage(imageMsg, 'image');
        let buffer   = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

        let processed;
        if      (type === 'blur')   processed = await sharp(buffer).blur(10).toBuffer();
        else if (type === 'gray')   processed = await sharp(buffer).grayscale().toBuffer();
        else if (type === 'rotate') processed = await sharp(buffer).rotate(90).toBuffer();
        else                        processed = await sharp(buffer).resize(900).sharpen().toBuffer();

        await sock.sendMessage(from, {
            image:   processed,
            caption: `🖼️ Edited: *${type}*`
        }, { quoted: msg });

    } catch (e) {
        logger.error('Photo edit error:', e.message);
        await sock.sendMessage(from, { text: '❌ Photo edit imeshindwa' }, { quoted: msg });
    }
}

// ════════════════════════════════════════════════
//   🚀 MAIN COMMAND EXPORT
//   FIX #1 — execute() inaitwa na handler.js tayari
//   Haihitaji kufanya prefix/reply detection yake yenyewe
//   Handler imeshaamua kuiita — tunachukua tu query na kujibu
// ════════════════════════════════════════════════
export const name        = 'ai';
export const description = 'AI Assistant + Photo Editor';
export const category    = 'ai';
export const alias       = ['bot'];

export async function execute(sock, msg, args) {
    const from   = msg.key.remoteJid;
    const sender = msg.key.participant || from;

    const fullText = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text || ''
    ).trim();

    // ── Photo editor ──
    if (/^\.photo/i.test(fullText)) {
        return await handlePhoto(sock, msg, from, fullText);
    }

    // FIX #2 — Query extraction imesahihishwa
    // Handler imeshakata prefix — args ndio query
    // Lakini pia tunashughulikia kama fullText ina prefix bado
    let query = args.join(' ').trim();

    // Kama args tupu, jaribu kutoa query kutoka fullText
    if (!query) {
        query = fullText
            .replace(/^\.(ai|bot|photo)\s*/i, '')
            .trim();
    }

    if (!query) {
        await sock.sendMessage(from, {
            text: '💬 Tumia: *.ai swali lako*'
        }, { quoted: msg });
        return;
    }

    try {
        await sock.sendPresenceUpdate('composing', from);

        const history  = await getHistory(sender);
        const messages = [
            { role: 'system', content: SYSTEM },
            ...history,
            { role: 'user', content: query }
        ];

        const reply = await aiRouter(messages);
        if (!reply) throw new Error('Jibu tupu');

        // Typing delay kulingana na urefu — max sekunde 4
        const typingDelay = Math.min(reply.length * 30, 4000);
        await new Promise(resolve => setTimeout(resolve, typingDelay));

        await saveConversation(sender, query, reply);

        await sock.sendMessage(from, {
            text: `🤖 *26 Tech AI*\n\n${reply}`
        }, { quoted: msg });

    } catch (err) {
        logger.error('AI error: %s', err.message);
        await sock.sendMessage(from, {
            text: `❌ AI imeshindwa: ${err.message}`
        }, { quoted: msg });

    } finally {
        await sock.sendPresenceUpdate('paused', from).catch(() => {});
    }
}
