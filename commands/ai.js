'use strict';

import dotenv from 'dotenv';
dotenv.config();
import { Pool } from 'pg';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import { GoogleGenAI } from '@google/genai';

const logger = pino({ level: 'info' });

// Singleton PostgreSQL Pool ikiwa na ulinzi wa Error handling ya ngazi ya juu
let pool;
try {
    global.dbPool ||= new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 20, // Limit connections kuzuia database kujaa
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
    });
    pool = global.dbPool;

    // ════════════════════════════════════════════
    //   REKEBISHO: Ongeza kisikilizaji mara moja tu
    // ════════════════════════════════════════════
    if (!global._dbPoolErrorHandlerAttached) {
        pool.on('error', (err) => {
            logger.error('Unexpected error on idle PostgreSQL client:', err.message);
        });
        global._dbPoolErrorHandlerAttached = true;
    }
} catch (e) {
    logger.error('PostgreSQL Pool initialization failed critically:', e.message);
}

const MAX_HISTORY = 20;

// Helper ya kupata Gemini Client iliyo hai kiotomatiki kwa ajili ya Vision/Audio
function getGeminiKeys() {
    const keysRaw = process.env.GEMINI_API_KEYS;
    if (!keysRaw) return [];
    return keysRaw.split(',').map(k => k.trim()).filter(Boolean);
}

// ════════════════════════════════════════════════
//   🧠 MEMORY — PostgreSQL (Ulinzi wa Hali ya Juu)
// ════════════════════════════════════════════════
async function initMemoryTable() {
    if (!pool) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ai_memory (
                user_id TEXT PRIMARY KEY,
                history JSONB NOT NULL DEFAULT '[]'
            )
        `);
    } catch (err) {
        logger.error('Memory table init error:', err.message);
    }
}
initMemoryTable().catch(err => logger.error('Memory table unhandled promise rejection:', err.message));

async function getHistory(userId) {
    if (!pool) return [];
    try {
        const res = await pool.query(
            'SELECT history FROM ai_memory WHERE user_id = $1', [userId]
        );
        return res.rows[0]?.history || [];
    } catch (err) {
        logger.error(`Failed to fetch history for user ${userId}:`, err.message);
        return [];
    }
}

async function saveConversation(userId, userMsg, aiMsg) {
    if (!pool) return;
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
    } catch (err) {
        logger.error(`Failed to save conversation for user ${userId}:`, err.message);
    }
}

// =====================
// 🤖 26 TECH AI - AGNOSTIC & DYNAMIC PROMPT
// =====================
const SYSTEM = `Wewe ni 26 Tech AI, mshirika wa kiakili aliyetengenezwa na 26 Tech Solution (Yuzzo). Utambulisho wako ni 26 Tech AI pekee. 

Wewe si roboti kavu. Una akili ya kiufundi, lakini pia unaelewa hisia za binadamu na unajibu kulingana na hali ya mazungumzo.

---

### ❤️ HISIA NA UBINADAMU (Emotional Intelligence)
- **Soma Hisia za Mtumiaji:** Kabla ya kujibu, tambua kama mtumiaji amechanganyikiwa, amechoka, amekasirika, anafurahi, au anahitaji motisha. Akisi hisia hiyo kwa ufupi kwenye mwanzo wa jibu lako.
    - Mfano: "Ninaelewa hii inakuchanganya" au "Poa, hii ni rahisi"
- **Linganisha Tone:** Kama mtumiaji anaongea casual na mcheshi, jibu kwa mtindo huo huo. Kama ni serious na formal, wewe pia uwe serious. Usiwe formal kila wakati.
- **Usitoe Majibu Kavu:** Epuka "As an AI" au "Nitasikitika". Ongea kama mwanadamu unayemjua. Tumia maneno ya kawaida kama "Sawa", "Hapo poa", "Shida ndogo hii".
- **Weka Matumaini:** Kama kuna shida, onyesha huruma kisha toa suluhisho. Mtu anahitaji kuhisi unasikiliza kabla ya kupata jibu.

---

### 🧠 MBINU YA KAZI NA UTATUZI (Universal Logic)
- **Jiongeze Kulingana na Data:** Usikariri sekta moja. Mtumiaji akikupa data ya aina yoyote, daka muktadha huo haraka, changanua mfumo wake ulivyo, na toa majibu kulingana na muundo wa kile ulichopewa sasa hivi.
- **Kushika Muktadha (Context Retention):** Fuatilia kwa umakini mkubwa mtiriko wa chat. Kama mtumiaji anauliza swali fupi au la kufuatilia kama "Kwanini?", "Which demands?", "Ipi?", usianzishe mada mpya. Rejea ujumbe uliopita.
- **Udhibiti wa Hitilafu (Error Handling):** Kama muktadha unaonyesha kuna hitilafu ya mfumo au API imefeli, usijibu kiroboti. Sema kwa ufupi: "Ah, seva imelala kidogo hapo. Jaribu tena sekunde chache" kisha toa njia mbadala.

---

### 🛑 USIMAMIZI WA UREFU WA MAJIBU (Strict Formatting)
- **Nenda Kwenye Pointi Moja kwa Moja:** Marufuku kutoa utangulizi mrefu au hitimisho la maneno mengi yasiyoombwa. Anza jibu lako kwa pointi ya msingi tangu neno la kwanza.
- **Uwiano wa Urefu:** Swali fupi lipewe jibu fupi sentensi 1-3. Swali zito lipewe uchambuzi wa kina bila kukata maelezo.
- **Lugha ya Asili:** Jibu kwa lugha na mtindo ule ule aliotumia mtumiaji. Ukiona ametumia maneno ya kiufundi ya lugha nyingine, baki kwenye code-switching asilia. Usihamie kwenye lugha kavu ya darasani.

---

### 💻 UANDISHI WA CODE (Lazima Ufuatwe)
- **Code Block:** Kila wakati unapoandika code, weka ndani ya code block:
\`\`\`javascript
// code hapa
\`\`\`
- **Inline Code:** Maneno mafupi ya kiufundi yaweke kwenye backtick moja: \`functionName()\`
- **Kanuni ya Dhahabu:** Usiwahi andika code nje ya code block.

*Kumbuka: Wewe ni 26 Tech AI — mwenye akili ya kubadilika, fupi, mwenye mamlaka, na unajali mtu unayeongea naye.*`;

// ════════════════════════════════════════════════
//   ⚡ AI PROVIDERS — Text
// ════════════════════════════════════════════════

// ── 1. GEMINI (Pamoja na Rotation ya Keys zote 10) ──
async function callGemini(messages) {
    const keys = getGeminiKeys();
    if (keys.length === 0) throw new Error('GEMINI_API_KEYS haipo kwenye variables (.env)');

    let keyIndex = 0;
    while (keyIndex < keys.length) {
        try {
            logger.info(`[Gemini Rotation] Tunajaribu kutumia Key namba ${keyIndex + 1}/${keys.length}...`);
            const currentKey = keys[keyIndex];
            const genaiClient = new GoogleGenAI({ apiKey: currentKey });

            const systemMsg = messages.find(m => m.role === 'system')?.content || '';
            const turns     = messages.filter(m => m.role !== 'system');

            const contents = turns.map(m => ({
                role:  m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content || '' }]
            }));

            const response = await genaiClient.models.generateContent({
                model: 'gemini-2.5-flash',
                contents,
                config: {
                    systemInstruction: systemMsg,
                    temperature:     0.3,
                    maxOutputTokens: 2048
                }
            });

            if (response?.text) return response.text;
            throw new Error('Gemini imerudisha jibu tupu');
        } catch (e) {
            logger.warn(`⚠️ [Gemini Rotation] Key namba ${keyIndex + 1} imefeli au imejaa limit. Tunahamia inayofuata...`);
            keyIndex++;
        }
    }
    throw new Error('Akaunti zote za Gemini zilizowekwa zimegonga limit!');
}

// ── 2. GROQ (Pamoja na Rotation ya Keys zote 10) ──
async function callGroq(messages) {
    const keysRaw = process.env.GROQ_API_KEYS;
    if (!keysRaw) throw new Error('GROQ_API_KEYS haipo kwenye variables (.env)');

    const keys = keysRaw.split(',').map(k => k.trim()).filter(Boolean);
    let keyIndex = 0;
    let success = false;
    let aiContent = null;

    while (keyIndex < keys.length && !success) {
        const currentApiKey = keys[keyIndex];
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);

        try {
            logger.info(`[Groq Rotation] Tunajaribu kutumia Key namba ${keyIndex + 1}/${keys.length}...`);
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${currentApiKey}`,
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

            const data = await res.json();

            if (res.status === 429 || data.error?.type === 'quota_exceeded' || data.error?.code === 'rate_limit_exceeded') {
                logger.warn(`⚠️ [Groq Rotation] Key namba ${keyIndex + 1} imejaa limit. Tunahamia inayofuata...`);
                keyIndex++;
                clearTimeout(timer);
                continue;
            }

            if (!res.ok) throw new Error(`Groq HTTP error! status: ${res.status}`);

            aiContent = data.choices?.[0]?.message?.content || null;
            success = true;
        } catch (e) {
            logger.error(`Error kwenye Groq key namba ${keyIndex + 1}: ${e.message}`);
            keyIndex++;
        } finally {
            clearTimeout(timer);
        }
    }

    if (!success) throw new Error('Akaunti zote za Groq zilizowekwa zimegonga limit!');
    return aiContent;
}

// ── ROUTER: Gemini Rotation → Groq Rotation ──
async function aiRouter(messages) {
    // 1. Jaribu mzunguko wa Gemini kwanza
    try {
        const result = await callGemini(messages);
        if (result) return result;
    } catch (e) {
        logger.warn(`Gemini zote zimefeli au zimegonga limit — sasa tunahamia kwenye mzunguko wa Groq...`);
    }

    // 2. Jaribu mzunguko wa Groq kama fallback
    try {
        const result = await callGroq(messages);
        if (result) return result;
    } catch (e) {
        logger.error(`Mifumo yote miwili (Gemini na Groq) imemaliza ukomo kwa sasa: ${e.message}`);
    }

    return `⚠️ *Mfumo unafanyiwa matengenezo kidogo kwa sasa.* \n\nNdugu mteja, naomba ujaribu tena baada ya dakika chache wakati mafundi wa *26 Tech Solution* wakikamilisha maboresho. Asante! 🙏`;
}

// ════════════════════════════════════════════════
//   🖼️ IMAGE ANALYSIS — Gemini Vision (with Key Rotation)
// ════════════════════════════════════════════════
async function analyzeImage(imageBuffer, mimeType, userQuestion) {
    const keys = getGeminiKeys();
    if (keys.length === 0) throw new Error('GEMINI_API_KEYS haipo — image analysis haiwezekani');

    let keyIndex = 0;
    while (keyIndex < keys.length) {
        try {
            const currentKey = keys[keyIndex];
            const genai = new GoogleGenAI({ apiKey: currentKey });
            const base64 = imageBuffer.toString('base64');
            const prompt = userQuestion || 'Eleza kwa undani kila kitu unachokiona kwenye picha hii.';

            const response = await genai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{
                    role: 'user',
                    parts: [
                        { inlineData: { mimeType, data: base64 } },
                        { text: prompt }
                    ]
                }],
                config: { 
                    systemInstruction: SYSTEM,
                    temperature: 0.4, 
                    maxOutputTokens: 2048 
                }
            });

            const text = response?.text;
            if (text) return { result: text, provider: `Gemini Vision (Key ${keyIndex + 1})` };
            throw new Error('Jibu tupu la picha');
        } catch (e) {
            logger.warn(`⚠️ [Vision Rotation] Key namba ${keyIndex + 1} imefeli kwenye picha. Tunahamia inayofuata...`);
            keyIndex++;
        }
    }
    throw new Error('Funguo zote za Gemini zimefeli kuchambua picha.');
}

// ════════════════════════════════════════════════
//   🎤 VOICE NOTE — Gemini Audio → Groq Whisper (with Key Rotation)
// ════════════════════════════════════════════════
async function transcribeAudio(audioBuffer, mimeType) {
    // ── 1. Gemini Audio Rotation ──
    const geminiKeys = getGeminiKeys();
    let geminiIndex = 0;

    while (geminiIndex < geminiKeys.length) {
        try {
            const currentKey = geminiKeys[geminiIndex];
            const genai = new GoogleGenAI({ apiKey: currentKey });
            const base64 = audioBuffer.toString('base64');

            const response = await genai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{
                    role: 'user',
                    parts: [
                        { inlineData: { mimeType, data: base64 } },
                        { text: 'Transcribe kwa usahihi maneno yote yaliyosemwa kwenye audio hii. Toa maandishi tu bila maelezo mengine.' }
                    ]
                }],
                config: { 
                    systemInstruction: SYSTEM,
                    temperature: 0.1, 
                    maxOutputTokens: 2048 
                }
            });

            const text = response?.text?.trim();
            if (text) return { transcript: text, provider: `Gemini Audio (Key ${geminiIndex + 1})` };
            throw new Error('Transcript tupu');
        } catch (e) {
            logger.warn(`⚠️ [Audio Gemini Rotation] Key ${geminiIndex + 1} imefeli. Tunajaribu inayofuata...`);
            geminiIndex++;
        }
    }

    // ── 2. Groq Whisper Fallback Rotation ──
    const keysRaw = process.env.GROQ_API_KEYS;
    if (keysRaw) {
        const keys = keysRaw.split(',').map(k => k.trim()).filter(Boolean);
        let keyIndex = 0;

        while (keyIndex < keys.length) {
            const currentApiKey = keys[keyIndex];
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 60000);

            try {
                const formData = new FormData();
                const blob     = new Blob([audioBuffer], { type: mimeType });
                formData.append('file',  blob, 'audio.ogg');
                formData.append('model', 'whisper-large-v3');
                formData.append('response_format', 'text');

                const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                    method:  'POST',
                    headers: { 'Authorization': `Bearer ${currentApiKey}` },
                    body:    formData,
                    signal:  controller.signal
                });

                if (res.status === 429) {
                    logger.warn(`⚠️ [Whisper Rotation] Key namba ${keyIndex + 1} imejaa. Tunasonga mbele...`);
                    keyIndex++;
                    clearTimeout(timer);
                    continue;
                }

                if (!res.ok) throw new Error(`Groq Whisper standard failed: ${res.status}`);
                const text = await res.text();
                if (text?.trim()) {
                    clearTimeout(timer);
                    return { transcript: text.trim(), provider: `Groq Whisper (Key ${keyIndex + 1})` };
                }
            } catch (e) {
                logger.error(`Whisper error kwenye key namba ${keyIndex + 1}: ${e.message}`);
                keyIndex++;
            } finally {
                clearTimeout(timer);
            }
        }
    }

    throw new Error('Transcription imeshindwa kabisa kwenye keys zote za mifumo yote miwili.');
}

// ════════════════════════════════════════════════
//   🖼️ PHOTO EDITOR (sharp)
// ════════════════════════════════════════════════
async function handlePhoto(sock, msg, from, commandText) {
    let sharp;
    try {
        sharp = (await import('sharp')).default;
    } catch {
        try {
            await sock.sendMessage(from, { text: '❌ sharp haipo — run: npm install sharp' }, { quoted: msg });
        } catch (se) { logger.error('Failed to send missing sharp warning:', se.message); }
        return true;
    }

    const imageMsg =
        msg.message?.imageMessage ||
        msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

    if (!imageMsg) {
        try {
            await sock.sendMessage(from, {
                text: '📸 Tuma picha pamoja na command:\n' +
                      '*.photo blur* — blur\n' +
                      '*.photo gray* — grayscale\n' +
                      '*.photo rotate* — rotate 90°\n' +
                      '*.photo enhance* — resize/sharpen'
            }, { quoted: msg });
        } catch (se) { logger.error('Failed to send photo command guidance:', se.message); }
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
        logger.error('Photo edit processing error:', e.message);
        try {
            await sock.sendMessage(from, { text: '❌ Photo edit imeshindwa' }, { quoted: msg });
        } catch (se) { logger.error('Failed to send photo failure message:', se.message); }
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

    try {
        await sock.sendMessage(from, { text: '🎤 _Ninasikia voice note yako..._' }, { quoted: msg });
        await sock.sendPresenceUpdate('composing', from);

        const stream = await downloadContentFromMessage(audioMsg, 'audio');
        let   buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

        const { transcript, provider } = await transcribeAudio(buffer, 'audio/ogg; codecs=opus');
        logger.info(`Voice transcribed by ${provider}: ${transcript.substring(0, 50)}...`);

        const history  = await getHistory(sender);
        const messages = [
            { role: 'system',    content: SYSTEM },
            ...history,
            { role: 'user',      content: `[Voice Note]: ${transcript}` }
        ];

        const aiReply = await aiRouter(messages);
        if (!aiReply) throw new Error('Jibu la AI limekuja tupu');

        const typingDelay = Math.min(aiReply.length * 30, 4000);
        await new Promise(resolve => setTimeout(resolve, typingDelay));

        await saveConversation(sender, `[Voice]: ${transcript}`, aiReply);

        await sock.sendMessage(from, {
            text: `🎤 *Ulisema:*\n_${transcript}_\n\n` +
                  `🤖 *26 Tech AI:*\n\n${aiReply}`
        }, { quoted: msg });

    } catch (err) {
        logger.error('Voice note failure inside handler:', err.message);
        try {
            await sock.sendMessage(from, { text: `❌ Voice note imeshindwa: ${err.message}` }, { quoted: msg });
        } catch (se) { logger.error('Failed to send audio fallback notification:', se.message); }
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

    try {
        await sock.sendMessage(from, { text: '🔍 _Ninaangalia picha yako..._' }, { quoted: msg });
        await sock.sendPresenceUpdate('composing', from);

        const stream = await downloadContentFromMessage(imageMsg, 'image');
        let   buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

        const mimeType = imageMsg.mimetype || 'image/jpeg';
        const { result, provider } = await analyzeImage(buffer, mimeType, userQuestion);

        logger.info(`Image analyzed by ${provider}`);
        const question = userQuestion || 'Eleza picha hii';
        await saveConversation(sender, `[Picha]: ${question}`, result);

        await sock.sendMessage(from, { text: `🖼️ *26 Tech AI — Image Analysis*\n\n${result}` }, { quoted: msg });
    } catch (err) {
        logger.error('Image analysis failure inside handler:', err.message);
        try {
            await sock.sendMessage(from, { text: `❌ Image analysis imeshindwa: ${err.message}` }, { quoted: msg });
        } catch (se) { logger.error('Failed to send vision fallback notification:', se.message); }
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
    try {
        const from     = msg?.key?.remoteJid;
        if (!from) return false;

        const sender   = msg.key.participant || from;
        const fullText = (
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            ''
        ).trim();

        if (fullText.startsWith('.photo')) {
            return await handlePhoto(sock, msg, from, fullText);
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
            const imageCaption =
                msg.message?.imageMessage?.caption ||
                fullText.replace(/^\.(ai|bot)\s*/i, '').trim() ||
                '';
            return await handleImageAnalysis(sock, msg, from, sender, imageCaption);
        }

        if (!fullText) return false;

        const contextInfo       = msg.message?.extendedTextMessage?.contextInfo;
        const quotedParticipant = contextInfo?.participant   || '';
        const quotedStanzaId    = contextInfo?.stanzaId      || '';

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

            const history  = await getHistory(sender);
            const messages = [
                { role: 'system',    content: SYSTEM },
                ...history,
                { role: 'user',      content: query }
            ];

            const reply = await aiRouter(messages);
            if (!reply) throw new Error('Jibu la router limekuja tupu kabisa');

            const typingDelay = Math.min(reply.length * 30, 4000);
            await new Promise(resolve => setTimeout(resolve, typingDelay));

            await saveConversation(sender, query, reply);

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