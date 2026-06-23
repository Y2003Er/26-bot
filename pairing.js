// pairing.js - Router Version v3.2 by 26-TECH
import express from 'express';
import pino from 'pino';
import QRCode from 'qrcode';
import {
    default as makeWASocket,
    Browsers,
    delay
} from '@whiskeysockets/baileys';
import { usePostgresAuthState } from './session-db.js';

const router = express.Router();
const logger = pino({ level: 'info' });
const PAIR_RATE_LIMIT = 120000;
const pairRequests = new Map();
const activeSockets = new Map();

async function sendSessionToUser(sock, number) {
    try {
        const jid = number + '@s.whatsapp.net';
        const sessionId = `pair_temp_${number}`;
        const { state } = await usePostgresAuthState(sessionId);
        const sessionJson = JSON.stringify(state.creds, null, 2);

        await sock.sendMessage(jid, {
            text: `✅ *Umefanikiwa kuunganisha 26-TECH BOT!*\n\n` +
                  `🔑 *Session ID yako:*\n` +
                  `\`\`\`${sessionId}\`\`\`\n\n` +
                  `📦 *Session Data (JSON):*\n` +
                  `\`\`\`${sessionJson.slice(0, 1000)}\`\`\`\n\n` +
                  `> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
        });
        console.log(`[PAIR] ✅ Session imetumwa kwa ${number}`);
    } catch (e) {
        console.error(`[PAIR] ❌ Send session error:`, e.message);
    }
}

function safeEnd(sock, number) {
    try { sock.end(); } catch {}
    if (number) activeSockets.delete(number);
    console.log(`[PAIR] 🔌 Socket imefungwa kwa ${number}`);
}

router.post('/pair', async (req, res) => {
    try {
        const { number, method } = req.body;

        if (!number || !/^\d{10,15}$/.test(number)) {
            return res.status(400).json({ success: false, error: 'Namba si sahihi' });
        }

        if (!method || !['code', 'qr'].includes(method)) {
            return res.status(400).json({ success: false, error: 'Weka method: code au qr' });
        }

        const lastRequest = pairRequests.get(number);
        if (lastRequest && (Date.now() - lastRequest) < PAIR_RATE_LIMIT) {
            return res.status(429).json({
                success: false,
                error: `Subiri ${Math.ceil((PAIR_RATE_LIMIT - (Date.now() - lastRequest)) / 1000)}s`
            });
        }

        // ✅ Funga socket ya zamani kama ipo
        if (activeSockets.has(number)) {
            try { activeSockets.get(number).end(); } catch {}
            activeSockets.delete(number);
            await delay(500);
        }

        const sessionId = `pair_temp_${number}`;
        const { state, saveCreds } = await usePostgresAuthState(sessionId);

        // ✅ Reset creds — WhatsApp itatoa popup/QR fresh
        if (state.creds?.me) {
            state.creds.me = undefined;
            state.creds.account = undefined;
            state.creds.registered = false;
        }

        console.log(`[PAIR] 🚀 Inaanza socket kwa ${number} method=${method}`);

        const sock = makeWASocket({
            auth: state,
            logger,
            printQRInTerminal: false,
            browser: Browsers.ubuntu('Chrome'),
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 30000,
            keepAliveIntervalMs: 30000,
            retryRequestDelayMs: 2000,
            generateHighQualityLinkPreview: false,
            syncFullHistory: false,
        });

        activeSockets.set(number, sock);
        sock.ev.on('creds.update', saveCreds);

        // ════════════════
        // Case 1: QR Code
        // ════════════════
        if (method === 'qr') {
            let qrSent = false;

            const qrTimeout = setTimeout(() => {
                console.log(`[PAIR] ⏰ QR timeout kwa ${number}`);
                if (!res.headersSent) {
                    res.status(408).json({ success: false, error: 'QR imeisha muda — jaribu tena' });
                }
                safeEnd(sock, number);
            }, 60000);

            sock.ev.on('connection.update', async (update) => {
                const { qr, connection } = update;
                console.log(`[PAIR QR] connection=${connection} qr=${!!qr}`);

                if (qr && !qrSent) {
                    qrSent = true;
                    clearTimeout(qrTimeout);
                    try {
                        const qrImage = await QRCode.toDataURL(qr, {
                            errorCorrectionLevel: 'H',
                            width: 512,
                            margin: 2,
                        });
                        if (!res.headersSent) {
                            res.json({ success: true, method: 'qr', qr: qrImage });
                        }
                        console.log(`[PAIR] ✅ QR imetumwa kwa frontend`);
                    } catch (e) {
                        console.error(`[PAIR] ❌ QR generation error:`, e.message);
                        if (!res.headersSent) {
                            res.status(500).json({ success: false, error: 'QR generation failed' });
                        }
                        safeEnd(sock, number);
                        return;
                    }
                    setTimeout(() => safeEnd(sock, number), 120000);
                }

                if (connection === 'open') {
                    clearTimeout(qrTimeout);
                    console.log(`[PAIR] ✅ QR scan imefanikiwa kwa ${number}`);
                    console.log(`[PAIR] Creds me:`, sock.authState?.creds?.me?.id);
                    await delay(15000);
                    await sendSessionToUser(sock, number);
                    setTimeout(() => safeEnd(sock, number), 15000);
                }

                if (connection === 'close') {
                    console.log(`[PAIR] ❌ QR connection imefungwa kwa ${number}`);
                    if (!qrSent && !res.headersSent) {
                        clearTimeout(qrTimeout);
                        res.status(500).json({ success: false, error: 'Imeshindwa kuunganika — jaribu tena' });
                    }
                    safeEnd(sock, number);
                }
            });

            await delay(65000);
            if (!res.headersSent) {
                safeEnd(sock, number);
                return res.status(408).json({ success: false, error: 'QR imeisha muda — jaribu tena' });
            }
        }

        // ════════════════
        // Case 2: Pairing Code
        // ════════════════
        if (method === 'code') {
            let codeSent = false;

            const codeTimeout = setTimeout(() => {
                console.log(`[PAIR] ⏰ Code timeout kwa ${number}`);
                if (!res.headersSent) {
                    res.status(500).json({ success: false, error: 'Imeshindwa kuunganika — jaribu tena' });
                }
                safeEnd(sock, number);
            }, 30000);

            sock.ev.on('connection.update', async (update) => {
                const { connection } = update;
                console.log(`[PAIR CODE] connection=${connection}`);

                if (connection === 'connecting' && !codeSent) {
                    codeSent = true;
                    clearTimeout(codeTimeout);
                    console.log(`[PAIR] 📱 Inaomba pairing code kwa ${number}...`);

                    try {
                        await delay(1500);
                        const code = await sock.requestPairingCode(number);
                        pairRequests.set(number, Date.now());
                        console.log(`[PAIR] ✅ Code imepatikana: ${code}`);

                        if (!res.headersSent) {
                            res.json({
                                success: true,
                                method: 'code',
                                code: code.match(/.{1,4}/g).join('-')
                            });
                        }

                        // ✅ Dakika 5 — muda wa kutosha
                        setTimeout(() => safeEnd(sock, number), 300000);

                    } catch (err) {
                        console.error(`[PAIR] ❌ Code error:`, err.message);
                        if (!res.headersSent) {
                            res.status(500).json({ success: false, error: 'Imeshindwa kupata code — jaribu tena' });
                        }
                        safeEnd(sock, number);
                    }
                }

                // ✅ Mtumiaji ameweka code
                if (connection === 'open') {
                    console.log(`[PAIR] ✅ Code link imefanikiwa kwa ${number}`);
                    console.log(`[PAIR] Creds me:`, sock.authState?.creds?.me?.id);
                    await delay(15000);
                    console.log(`[PAIR] Inatuma session kwa ${number}...`);
                    await sendSessionToUser(sock, number);
                    setTimeout(() => safeEnd(sock, number), 15000);
                }

                if (connection === 'close') {
                    console.log(`[PAIR] ❌ Connection imefungwa kwa ${number} baada ya code`);
                }
            });
        }

    } catch (err) {
        console.error('[PAIR] ❌ Pair error:', err.message);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: 'Imeshindwa' });
        }
    }
});

export default router;