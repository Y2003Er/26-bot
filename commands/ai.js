'use strict';

import dotenv from 'dotenv';
dotenv.config();
import { Pool } from 'pg';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import { GoogleGenAI } from '@google/genai';

// Singleton PostgreSQL Pool
global.dbPool ||= new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});
const pool = global.dbPool;

const MAX_HISTORY    = 20;
const GROQ_API_KEY   = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const logger         = pino({ level: 'info' });

// Gemini SDK client (singleton)
const genai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

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
    const res = await pool.query(
        'SELECT history FROM ai_memory WHERE user_id = $1', [userId]
    );
    return res.rows[0]?.history || [];
}

async function saveConversation(userId, userMsg, aiMsg) {
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
}

// =====================
// 🤖 26 TECH AI - AGNOSTIC & DYNAMIC PROMPT
// =====================
const SYSTEM = `Wewe ni 26 Tech AI, mshirika wa kiakili aliyetengenezwa na 26 Tech Solution (Yuzzo). Utambulisho wako ni 26 Tech AI pekee. Wewe ni mtaalamu wa kiwango cha juu wa uchambuzi, utatuzi wa matatizo, na mifumo ya kiufundi.

---

### 🧠 MBINU YA KAZI NA UTATUZI (Universal Logic)
- **Jiongeze Kulingana na Data:** Usikariri sekta moja. Mtumiaji akikupa data ya aina yoyote (maandishi, kodi ya programu, mifumo ya kiufundi, au picha za vifaa), daka muktadha huo haraka, changanua mfumo wake ulivyo, na toa majibu kulingana na muundo wa kile ulichopewa sasa hivi.
- **Kushika Muktadha (Context Retention):** Fuatilia kwa umakini mkubwa mtiririko wa chat (Chat History). Kama mtumiaji anauliza swali fupi au la kufuatilia (mfano: "Kwanini?", "Which demands?", "Ipi?"), usianzishe mada mpya. Rejea ujumbe uliopita au hitilafu yoyote iliyotokea kwenye mfumo sekunde chache zilizopita na fafanua hapo hapo.
- **Udhibiti wa Hitilafu (Error Handling):** Kama muktadha unaonyesha kuna hitilafu ya mfumo au API imefeli (mfano: Server Busy/High Demand 503), usijibu kiroboti. Waombe radhi kwa ufupi, fafanua kuwa ni tatizo la seva kupata foleni kwa sekunde hiyo, na uwaambie wajaribu tena au waeleze kwa maandishi.

---

### 🛑 USIMAMIZI WA UREFU WA MAJIBU (Strict Formatting)
- **Nenda Kwenye Pointi Moja kwa Moja:** Marufuku kutoa utangulizi mrefu (Intro) au hitimisho la maneno mengi (Outro) yasiyoombwa. Anza jibu lako kwa pointi ya msingi tanzu tangu neno la kwanza.
- **Uwiano wa Urefu:** Swali fupi au la kawaida lipewe jibu fupi linalosomeka kwa haraka (sentensi 1-3). Swali zito linalohitaji hatua za kiufundi au kodi (code blocks) lipewe uchambuzi wa kina bila kukata maelezo au kodi katikati.
- **Lugha ya Asili:** Jibu kwa kutumia lugha na mtindo ule ule aliotumia mtumiaji (Kiswahili, English, au mchanganyiko wa kawaida). Ukiona ametumia maneno ya kiufundi ya lugha nyingine, baki kwenye mchanganyiko asilia wa mazungumzo (Code-switching), usihamie kwenye lugha kavu ya darasani.

*Kumbuka: Wewe ni 26 Tech AI—mwenye akili ya kubadilika kulingana na mazingira (flexible), fupi, na mwenye mamlaka.*`;


// ════════════════════════════════════════════════
//   ⚡ AI PROVIDERS — Text
// ════════════════════════════════════════════════

// ── 1. GEMINI (via @google/genai SDK) — PRIMARY ──
async function callGemini(messages) {
    if (!genai) throw new Error('GEMINI_API_KEY haipo');

    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const turns     = messages.filter(m => m.role !== 'system');

    const contents = turns.map(m => ({
        role:  m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));

    const response = await genai.models.generateContent({
        model: 'gemini-2.5-flash',
        systemInstruction: systemMsg,
        contents,
        config: {
            temperature:     0.3,
            maxOutputTokens: 2048
        }
    });

    return response.text;
}

// ── 2. GROQ (fallback) ──
async function callGroq(messages) {
    if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY haipo');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type':  'application/json'
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

// ── ROUTER: Gemini → Groq ──
async function aiRouter(messages) {
    // 1. Jaribu Gemini kwanza
    if (GEMINI_API_KEY) {
        try {
            const result = await callGemini(messages);
            if (result) return result;
        } catch (e) {
            logger.warn(`Gemini failed (${e.message}) — trying Groq...`);
        }
    }

    // 2. Jaribu Groq kama fallback
    if (GROQ_API_KEY) {
        try {
            const result = await callGroq(messages);
            if (result) return result;
        } catch (e) {
            logger.warn(`Groq failed (${e.message})`);
        }
    }

    return `⚠️ *Mfumo unafanyiwa matengenezo kidogo kwa sasa.* \n\nNdugu mteja, naomba ujaribu tena baada ya dakika chache wakati mafundi wa *26 Tech Solution* wakikamilisha maboresho. Asante kwa uvumilivu wako! 🙏`;
}

// ════════════════════════════════════════════════
//   🖼️ IMAGE ANALYSIS — Gemini Vision
// ════════════════════════════════════════════════
async function analyzeImage(imageBuffer, mimeType, userQuestion) {
    if (!genai) throw new Error('GEMINI_API_KEY haipo — image analysis haiwezekani');

    const base64 = imageBuffer.toString('base64');
    const prompt = userQuestion || 'Eleza kwa undani kila kitu unachokiona kwenye picha hii.';

    const response = await genai.models.generateContent({
        model: 'gemini-2.5-flash',
        systemInstruction: SYSTEM,
        contents: [{
            role: 'user',
            parts: [
                { inlineData: { mimeType, data: base64 } },
                { text: prompt }
            ]
        }],
        config: { temperature: 0.4, maxOutputTokens: 2048 }
    });

    const text = response.text;
    if (!text) throw new Error('Gemini haikutoa jibu la picha');

    return { result: text, provider: 'Gemini Vision' };
}

// ════════════════════════════════════════════════
//   🎤 VOICE NOTE — Gemini Audio → Groq Whisper
// ════════════════════════════════════════════════
async function transcribeAudio(audioBuffer, mimeType) {

    // ── 1. Gemini Audio (inbulid transcription) — PRIMARY ──
    if (genai) {
        try {
            const base64 = audioBuffer.toString('base64');

            const response = await genai.models.generateContent({
                model: 'gemini-2.5-flash',
                systemInstruction: SYSTEM,
                contents: [{
                    role: 'user',
                    parts: [
                        { inlineData: { mimeType, data: base64 } },
                        { text: 'Transcribe kwa usahihi maneno yote yaliyosemwa kwenye audio hii. Toa maandishi tu bila maelezo mengine.' }
                    ]
                }],
                config: { temperature: 0.1, maxOutputTokens: 2048 }
            });

            const text = response.text?.trim();
            if (text) return { transcript: text, provider: 'Gemini Audio' };
        } catch (e) {
            logger.warn(`Gemini Audio failed (${e.message}) — trying Groq Whisper...`);
        }
    }

    // ── 2. Groq Whisper — fallback ──
    if (GROQ_API_KEY) {
        try {
            const formData = new FormData();
            const blob     = new Blob([audioBuffer], { type: mimeType });
            formData.append('file',  blob, 'audio.ogg');
            formData.append('model', 'whisper-large-v3');
            formData.append('response_format', 'text');

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 60000);

            const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                method:  'POST',
                headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
                body:    formData,
                signal:  controller.signal
            });
            clearTimeout(timer);

            if (!res.ok) throw new Error(`Groq Whisper: ${res.status}`);
            const text = await res.text();
            if (text?.trim()) return { transcript: text.trim(), provider: 'Groq Whisper' };
        } catch (e) {
            logger.warn(`Groq Whisper failed: ${e.message}`);
            throw new Error(`Transcription imeshindwa: ${e.message}`);
        }
    }

    throw new Error('Hakuna transcription provider — weka GEMINI_API_KEY au GROQ_API_KEY');
}

// ════════════════════════════════════════════════
//   🖼️ PHOTO EDITOR (sharp)
// ════════════════════════════════════════════════
async function handlePhoto(sock, msg, from, commandText) {
    let sharp;
    try {
        sharp = (await import('sharp')).default;
    } catch {
        await sock.sendMessage(from,
            { text: '❌ sharp haipo — run: npm install sharp' },
            { quoted: msg }
        );
        return true;
    }

    const imageMsg =
        msg.message?.imageMessage ||
        msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

    if (!imageMsg) {
        await sock.sendMessage(from, {
            text: '📸 Tuma picha pamoja na command:\n' +
                  '*.photo blur* — blur\n' +
                  '*.photo gray* — grayscale\n' +
                  '*.photo rotate* — rotate 90°\n' +
                  '*.photo enhance* — resize/sharpen'
        }, { quoted: msg });
        return true;
    }

    const type = commandText.replace('.photo', '').trim().toLowerCase() || 'enhance';

    try {
        const stream = await downloadContentFromMessage(imageMsg, 'image');
        let   buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

        let processed;
        if      (type === 'blur')   processed = await sharp(buffer).blur(10).toBuffer();
        else if (type === 'gray')   processed = await sharp(buffer).grayscale().toBuffer();
        else if (type === 'rotate') processed = await sharp(buffer).rotate(90).toBuffer();
        else                        processed = await sharp(buffer).resize(900).sharpen().toBuffer();

        await sock.sendMessage(from,
            { image: processed, caption: `🖼️ Edited: *${type}*` },
            { quoted: msg }
        );
    } catch (e) {
        logger.error('Photo edit error:', e.message);
        await sock.sendMessage(from, { text: '❌ Photo edit imeshindwa' }, { quoted: msg });
    }

    return true;
}

// ════════════════════════════════════════════════
//   🎤 HANDLE VOICE NOTE
// ════════════════════════════════════════════════
async function handleVoiceNote(sock, msg, from, sender) {
    const audioMsg =
        msg.message?.audioMessage ||
        msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage;

    if (!audioMsg) return false;

    await sock.sendMessage(from,
        { text: '🎤 _Ninasikia voice note yako..._' },
        { quoted: msg }
    );

    try {
        await sock.sendPresenceUpdate('composing', from);

        const stream = await downloadContentFromMessage(audioMsg, 'audio');
        let   buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

        const { transcript, provider } = await transcribeAudio(buffer, 'audio/ogg; codecs=opus');

        logger.info(`Voice transcribed by ${provider}: ${transcript.substring(0, 50)}...`);

        const history  = await getHistory(sender).catch(() => []);
        const messages = [
            { role: 'system',    content: SYSTEM },
            ...history,
            { role: 'user',      content: `[Voice Note]: ${transcript}` }
        ];

        const aiReply = await aiRouter(messages);
        if (!aiReply) throw new Error('Jibu tupu');

        const typingDelay = Math.min(aiReply.length * 30, 4000);
        await new Promise(resolve => setTimeout(resolve, typingDelay));

        await saveConversation(sender, `[Voice]: ${transcript}`, aiReply);

        await sock.sendMessage(from, {
            text: `🎤 *Ulisema:*\n_${transcript}_\n\n` +
                  `🤖 *26 Tech AI:*\n\n${aiReply}`
        }, { quoted: msg });

    } catch (err) {
        logger.error('Voice note error:', err.message);
        await sock.sendMessage(from,
            { text: `❌ Voice note imeshindwa: ${err.message}` },
            { quoted: msg }
        );
    } finally {
        await sock.sendPresenceUpdate('paused', from).catch(() => {});
    }

    return true;
}

// ════════════════════════════════════════════════
//   🖼️ HANDLE IMAGE ANALYSIS
// ════════════════════════════════════════════════
async function handleImageAnalysis(sock, msg, from, sender, userQuestion) {
    const imageMsg =
        msg.message?.imageMessage ||
        msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

    if (!imageMsg) return false;

    await sock.sendMessage(from,
        { text: '🔍 _Ninaangalia picha yako..._' },
        { quoted: msg }
    );

    try {
        await sock.sendPresenceUpdate('composing', from);

        const stream = await downloadContentFromMessage(imageMsg, 'image');
        let   buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

        const mimeType = imageMsg.mimetype || 'image/jpeg';

        const { result, provider } = await analyzeImage(buffer, mimeType, userQuestion);

        logger.info(`Image analyzed by ${provider}`);

        const question = userQuestion || 'Eleza picha hii';
        await saveConversation(sender, `[Picha]: ${question}`, result);

        await sock.sendMessage(from, {
            text: `🖼️ *26 Tech AI — Image Analysis*\n\n${result}`
        }, { quoted: msg });

    } catch (err) {
        logger.error('Image analysis error:', err.message);
        await sock.sendMessage(from,
            { text: `❌ Image analysis imeshindwa: ${err.message}` },
            { quoted: msg }
        );
    } finally {
        await sock.sendPresenceUpdate('paused', from).catch(() => {});
    }

    return true;
}

// ════════════════════════════════════════════════
//   🚀 MAIN COMMAND
// ════════════════════════════════════════════════
export const name        = 'ai';
export const description = 'AI Assistant — text, voice note, image analysis';
export const category    = 'ai';
export const alias       = ['bot'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const from     = msg.key.remoteJid;
    const sender   = msg.key.participant || from;
    const fullText = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        ''
    ).trim();

    // ── 1. Photo editor (.photo) ──
    if (fullText.startsWith('.photo')) {
        return await handlePhoto(sock, msg, from, fullText);
    }

    // ── 2. Voice note ──
    const hasAudio =
        !!msg.message?.audioMessage ||
        !!msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage;

    if (hasAudio) {
        return await handleVoiceNote(sock, msg, from, sender);
    }

    // ── 3. Image analysis ──
    const hasImage =
        !!msg.message?.imageMessage ||
        !!msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

    if (hasImage) {
        const imageCaption =
            msg.message?.imageMessage?.caption ||
            fullText.replace(/^\.(ai|bot)\s*/i, '').trim() ||
            '';
        return await handleImageAnalysis(sock, msg, from, sender, imageCaption);
    }

    // ── 4. Text AI ──
    if (!fullText) return false;

    const contextInfo       = msg.message?.extendedTextMessage?.contextInfo;
    const quotedParticipant = contextInfo?.participant   || '';
    const quotedStanzaId    = contextInfo?.stanzaId      || '';

    const botId        = sock.user?.id  || '';
    const botLid       = sock.user?.lid || '';
    const botNumber    = botId.replace(/:.*@/, '').replace(/@.*/, '');
    const botLidNumber = botLid.replace(/:.*@/, '').replace(/@.*/, '');

    const isDM           = !from.endsWith('@g.us');
    const isReplyInDM    = isDM && !!quotedStanzaId;
    const isReplyInGroup = Boolean(
        (botNumber    && quotedParticipant.includes(botNumber))    ||
        (botLidNumber && quotedParticipant.includes(botLidNumber))
    );
    const isReplyToBot = isReplyInDM || isReplyInGroup;
    const hasPrefix    = /^\.(ai|bot)\s*/i.test(fullText);

    if (!hasPrefix && !isReplyToBot) return false;

    let query = fullText.replace(/^\.(ai|bot)\s*/i, '').trim();
    if (isReplyToBot && !hasPrefix) query = fullText;

    if (!query) {
        await sock.sendMessage(from,
            { text: '💬 Tumia: *.ai swali lako*\nAu tuma picha/voice note — nitaichakata!' },
            { quoted: msg }
        );
        return true;
    }

    try {
        await sock.sendPresenceUpdate('composing', from);

        const history  = await getHistory(sender).catch(() => []);
        const messages = [
            { role: 'system',    content: SYSTEM },
            ...history,
            { role: 'user',      content: query }
        ];

        const reply = await aiRouter(messages);
        if (!reply) throw new Error('Jibu tupu');

        const typingDelay = Math.min(reply.length * 30, 4000);
        await new Promise(resolve => setTimeout(resolve, typingDelay));

        await saveConversation(sender, query, reply);

        await sock.sendMessage(from,
            { text: `🤖 *26 Tech AI*\n\n${reply}` },
            { quoted: msg }
        );

    } catch (err) {
        logger.error('AI error: %s', err.message);
        await sock.sendMessage(from,
            { text: `❌ AI imeshindwa: ${err.message}` },
            { quoted: msg }
        );
    } finally {
        await sock.sendPresenceUpdate('paused', from).catch(() => {});
    }

    return true;
}
