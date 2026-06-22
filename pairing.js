// pairing.js
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import pino from 'pino';
import QRCode from 'qrcode';
import {
    default as makeWASocket,
    Browsers,
    useMultiFileAuthState,
    delay
} from '@whiskeysockets/baileys';

const app = express();
app.use(cors());
app.use(express.json());

const logger = pino({ level: 'silent' });
const PAIR_RATE_LIMIT = 120000;
const pairRequests = new Map();

// DB auth state - badilisha hii kama unatumia Postgres
import { usePostgresAuthState } from './session-db.js';

app.post('/pair', async (req, res) => {
    try {
        const { number, session, method } = req.body; // method = "qr" au "code"

        if (!number || !/^\d{10,15}$/.test(number)) {
            return res.status(400).json({ success: false, error: 'Namba si sahihi' });
        }

        if (!session || session.length < 3) {
            return res.status(400).json({ success: false, error: 'Weka session name' });
        }

        const lastRequest = pairRequests.get(number);
        if (lastRequest && (Date.now() - lastRequest) < PAIR_RATE_LIMIT) {
            return res.status(429).json({ 
                success: false, 
                error: `Subiri ${Math.ceil((PAIR_RATE_LIMIT - (Date.now() - lastRequest)) / 1000)}s` 
            });
        }

        const { state, saveCreds } = await usePostgresAuthState(`sub_${session}`);

        const sock = makeWASocket({
            auth: state,
            logger,
            printQRInTerminal: false,
            browser: Browsers.ubuntu('Chrome'),
            connectTimeoutMs: 30000
        });

        sock.ev.on('creds.update', saveCreds);

        // Case 1: QR Code
        if (method === 'qr') {
            sock.ev.on('connection.update', async (update) => {
                const { qr, connection } = update;
                
                if (qr && !res.headersSent) {
                    const qrImage = await QRCode.toDataURL(qr);
                    res.json({ success: true, method: 'qr', qr: qrImage });
                }
                
                if (connection === 'open' && !res.headersSent) {
                    res.json({ success: true, method: 'qr', status: 'connected' });
                }
                
                if (connection === 'close') {
                    sock.end();
                }
            });
            
            await delay(60000);
            if (!res.headersSent) {
                res.status(408).json({ success: false, error: 'QR expired' });
            }
        }

        // Case 2: Pairing Code
        if (method === 'code') {
            if (!sock.authState.creds.registered) {
                const code = await sock.requestPairingCode(number);
                pairRequests.set(number, Date.now());
                res.json({ success: true, method: 'code', code: code.match(/.{1,3}/g).join('-') });
            } else {
                res.json({ success: false, error: 'Namba hii tayari imeregister' });
            }
            
            setTimeout(() => sock.end(), 30000);
        }

    } catch (err) {
        console.error('Pair error:', err.message);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: 'Imeshindwa' });
        }
    }
});

app.listen(process.env.PAIR_PORT || 3001, () => {
    console.log(`⚡ Pairing service running on port ${process.env.PAIR_PORT || 3001}`);
});