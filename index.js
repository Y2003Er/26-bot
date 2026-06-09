// index.js

import dotenv from 'dotenv';
dotenv.config();

import os from 'os';
import pino from 'pino';
import NodeCache from 'node-cache';
import {
    default as makeWASocket,
    DisconnectReason,
    Browsers,
} from '@whiskeysockets/baileys';

import './config.js';
import {
    loadCommands,
    handleMessage,
    setupContactListener,
    setupAntiDelete,
    setupAntiViewOnce,
    setupAutoStatusViewer
} from './lib/handler.js';
import {
    initializeDatabase,
    usePostgresAuthState,
    deleteAllSessions
} from './session-db.js';

const logger       = pino({ level: 'info' });
const PHONE_NUMBER = process.env.PHONE_NUMBER?.trim();
const SESSION_ID   = process.env.SESSION_ID || '26_tech_v5';
const PAIRING_DELAY = 5000;

global.prefix = process.env.PREFIX || '.';

const C = {
    reset:   '\x1b[0m',
    bold:    '\x1b[1m',
    cyan:    '\x1b[36m',
    green:   '\x1b[32m',
    yellow:  '\x1b[33m',
    red:     '\x1b[31m',
    gray:    '\x1b[90m',
    white:   '\x1b[97m',
    blue:    '\x1b[34m',
    magenta: '\x1b[35m',
};

const bannerState = {
    connection: '⏳ Starting...',
    database:   '⏳ Connecting...',
    commands:   '0 loaded',
    messages:   0,
    groups:     0,
    lastMsg:    '—',
    ai:         process.env.GROQ_API_KEY
                    ? 'Groq + Gemini'
                    : process.env.GEMINI_API_KEY
                    ? 'Gemini'
                    : '—',
    startTime:  Date.now(),
};

function getUptime() {
    const sec = Math.floor((Date.now() - bannerState.startTime) / 1000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function getRAM() {
    const used  = ((os.totalmem() - os.freemem()) / 1024 / 1024).toFixed(0);
    const total = (os.totalmem() / 1024 / 1024).toFixed(0);
    return `${used}/${total} MB`;
}

function printBanner() {
    const s = bannerState;

    const connVal = s.connection === 'ONLINE'
        ? `${C.green}${C.bold}🟢 ONLINE${C.reset}`
        : s.connection === 'connecting'
        ? `${C.yellow}⏳ Connecting...${C.reset}`
        : s.connection === 'OFFLINE'
        ? `${C.red}🔴 OFFLINE${C.reset}`
        : `${C.yellow}${s.connection}${C.reset}`;

    const dbVal = s.database.includes('✅')
        ? `${C.green}✅ Connected${C.reset}`
        : s.database.includes('❌')
        ? `${C.red}❌ Error${C.reset}`
        : `${C.yellow}${s.database}${C.reset}`;

    const lines = [
        `${C.cyan}┌─────────────────────────────────────────────┐${C.reset}`,
        `${C.cyan}│${C.reset}  ${C.bold}${C.yellow}⚡ 26-𝐓𝐄𝐂𝐇${C.reset}               ${C.gray}uptime: ${getUptime()}${C.reset}`,
        `${C.cyan}├─────────────────────────────────────────────┤${C.reset}`,
        `${C.cyan}│${C.reset}  ${C.bold}◈ Connection${C.reset}  →  ${connVal}`,
        `${C.cyan}│${C.reset}  ${C.bold}🗄️  Database${C.reset}   →  ${dbVal}`,
        `${C.cyan}│${C.reset}  ${C.bold}⚡ Commands${C.reset}   →  ${C.green}${s.commands}${C.reset}`,
        `${C.cyan}│${C.reset}  ${C.bold}📨 Messages${C.reset}   →  ${C.white}${s.messages}${C.reset}`,
        `${C.cyan}│${C.reset}  ${C.bold}👥 Groups${C.reset}     →  ${C.white}${s.groups}${C.reset}`,
        `${C.cyan}│${C.reset}  ${C.bold}🤖 AI${C.reset}         →  ${C.magenta}${s.ai}${C.reset}`,
        `${C.cyan}│${C.reset}  ${C.bold}💾 RAM${C.reset}        →  ${C.blue}${getRAM()}${C.reset}`,
        `${C.cyan}├─────────────────────────────────────────────┤${C.reset}`,
        `${C.cyan}│${C.reset}  ${C.gray}Last: ${s.lastMsg}${C.reset}`,
        `${C.cyan}└─────────────────────────────────────────────┘${C.reset}`,
    ];

    lines.forEach(line => console.log(line));
    console.log('');
}

function updateBanner(key, value) {
    if (value !== null && value !== undefined && key in bannerState) {
        bannerState[key] = value;
    }
}

const log = {
    info:    (msg) => console.log(`  ✦  ${msg}`),
    success: (msg) => console.log(`  ✔  ${msg}`),
    warn:    (msg) => console.warn(`  ⚠  ${msg}`),
    error:   (msg) => console.error(`  ✖  ${msg}`),
    state:   (msg) => console.log(`  ◈  ${msg}`),
    div:     ()    => console.log(`  ${'─'.repeat(46)}`),
    blank:   ()    => console.log(''),
};

if (!process.env.DATABASE_URL) {
    log.error('DATABASE_URL haipo — Bot imesimama.');
    process.exit(1);
}
if (!PHONE_NUMBER || !/^\d{10,15}$/.test(PHONE_NUMBER)) {
    log.error('PHONE_NUMBER si sahihi (mfano: 255753595142)');
    process.exit(1);
}

let sock             = null;
let isConnecting     = false;
let pairingRequested = false;
let bootLock         = false;
let openTimer        = null;
let hasEverOpened    = false;

function clearOpenTimer() {
    if (openTimer) clearTimeout(openTimer);
    openTimer = null;
}

function displayPairingCode(code) {
    console.log('\n╔══════════════════════════╗');
    console.log('║   🔑 PAIRING CODE        ║');
    console.log('╠══════════════════════════╣');
    console.log(`║      ${code}      ║`);
    console.log('╚══════════════════════════╝');
    console.log(`\n📋 CODE: ${code}\n`);
    console.log('👆 WhatsApp → Linked Devices → Link a Device');
    console.log('👆 Link with phone number → Weka namba yako');
    console.log('👆 Popup itatokea yenyewe — bonyeza CONFIRM\n');
}

async function startBot() {
    if (bootLock || isConnecting) return;
    if (sock?.ws?.readyState === 1) return;

    bootLock         = true;
    isConnecting     = true;
    pairingRequested = false;
    clearOpenTimer();

    try {
        await loadCommands();
        const cmdCount = global.allCommands?.size || 0;
        updateBanner('commands', `${cmdCount} loaded`);
        printBanner();

        const { state, saveCreds } = await usePostgresAuthState(SESSION_ID);
        const msgRetryCounterCache = new NodeCache();

        if (sock) {
            try {
                sock.ev.removeAllListeners();
                await sock.ws?.close();
                sock.end?.(new Error('Restarting'));
            } catch {}
            sock = null;
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        sock = makeWASocket({
            auth:                           state,
            msgRetryCounterCache,
            logger,
            printQRInTerminal:              false,
            browser:                        Browsers.ubuntu('Chrome'),
            connectTimeoutMs:               120000,
            keepAliveIntervalMs:            30000,
            defaultQueryTimeoutMs:          undefined,
            generateHighQualityLinkPreview: false,
            patchMessageBeforeSending:      (msg) => msg,
        });

        sock.ev.on('creds.update', saveCreds);
        setupContactListener(sock);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection) {
                updateBanner('connection', connection === 'open' ? 'ONLINE' : connection);
                log.state(`Connection  →  ${connection}`);
            }

            if (!pairingRequested && connection === 'connecting') {
                const isRegistered = !!(state.creds?.me || state.creds?.account);
                if (!isRegistered) {
                    pairingRequested = true;
                    log.info(`Subiri sekunde ${PAIRING_DELAY / 1000} kabla ya kuomba pairing code...`);
                    setTimeout(async () => {
                        try {
                            if (state.creds?.me || state.creds?.account) {
                                log.success('Session imeshaingia kabla ya pairing — skip.');
                                return;
                            }
                            log.info(`📱 Inaomba pairing code kwa: ${PHONE_NUMBER}`);
                            const code = await sock.requestPairingCode(PHONE_NUMBER);
                            displayPairingCode(code);
                        } catch (err) {
                            log.error(`Pairing code imeshindwa: ${err.message}`);
                            pairingRequested = false;
                        }
                    }, PAIRING_DELAY);
                } else {
                    log.success('Session ipo — haihitaji pairing.');
                }
            }

            if (connection === 'open') {
                clearOpenTimer();
                hasEverOpened = true;
                updateBanner('connection', 'ONLINE');

                try {
                    const groups = await sock.groupFetchAllParticipating();
                    updateBanner('groups', Object.keys(groups).length);
                } catch {}

                setupAntiDelete(sock);
                setupAntiViewOnce(sock);
                setupAutoStatusViewer(sock);

                log.div();
                log.success('BOT IMEUNGANIKA ✔');
                log.success('Session imehifadhiwa kwenye PostgreSQL (JSONB)');
                log.div();
                printBanner();
                isConnecting = false;
                bootLock     = false;
            }

            if (connection === 'close') {
                clearOpenTimer();
                const code = lastDisconnect?.error?.output?.statusCode;
                isConnecting = false;
                bootLock     = false;
                updateBanner('connection', 'OFFLINE');

                log.div();
                log.error(`Muunganiko Umevunjika → [${code ?? '?'}]`);

                if (code === 515) {
                    log.info('Pairing restart (515) — restarting in 2s...');
                    setTimeout(startBot, 2000);
                } else if (code === 440) {
                    log.warn('Connection replaced (440) — restarting in 15s...');
                    setTimeout(startBot, 15000);
                } else if (code === DisconnectReason.loggedOut || code === 401) {
                    // ✅ HAKUNA deleteSession hapa — session inabaki salama
                    // Kufuta session: weka CLEAN_SESSIONS=true kwenye .env/Railway kisha restart
                    log.warn('Code 401 — restarting bila kufuta session...');
                    log.warn('(Kama unataka fresh login: weka CLEAN_SESSIONS=true kwenye Railway)');
                    setTimeout(startBot, 10000);
                } else if (!hasEverOpened) {
                    log.warn('Haijaunganika kabla — restarting in 15s...');
                    setTimeout(startBot, 15000);
                } else {
                    log.warn('Disconnect baada ya open — restarting in 7s...');
                    setTimeout(startBot, 7000);
                }
            }
        });

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            const msg = messages[0];
            if (!msg.message) return;

            bannerState.messages++;
            const text =
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text || '[media]';
            const isGroup = msg.key.remoteJid?.endsWith('@g.us');
            const time    = new Date().toLocaleTimeString('en-GB', {
                hour: '2-digit', minute: '2-digit'
            });
            const source = isGroup ? 'Group' : 'DM';

            updateBanner('messages', bannerState.messages);
            updateBanner('lastMsg',
                `${time} · ${source} · ${text.slice(0, 25)}${text.length > 25 ? '...' : ''}`
            );

            console.log(`📩 ${msg.key.remoteJid}: ${text}`);
            await handleMessage(sock, msg);
        });

        openTimer = setTimeout(() => {
            log.warn('Timeout — restart...');
            isConnecting = false;
            bootLock     = false;
            try { sock?.ev?.removeAllListeners(); sock?.ws?.close(); } catch {}
            setTimeout(startBot, 7000);
        }, 180000);

        if (state.creds?.me || state.creds?.account) {
            log.success('Session ipo PostgreSQL — Inaunganika...');
        } else {
            log.info('Session mpya — inasubiri pairing...');
        }

    } catch (err) {
        log.error(`HITILAFU → ${err.message}`);
        isConnecting = false;
        bootLock     = false;
        setTimeout(startBot, 7000);
    }
}

(async () => {
    try {
        log.info('Inaunganika na PostgreSQL...');
        await initializeDatabase();
        updateBanner('database', '✅ Connected');

        // ✅ Session inafutwa MANUAL TU — weka CLEAN_SESSIONS=true kwenye Railway
        // Baada ya login mpya, irudi CLEAN_SESSIONS=false au ifute kabisa
        if (process.env.CLEAN_SESSIONS === 'true') {
            log.warn('🧹 CLEAN_SESSIONS=true — Inafuta session zote...');
            await deleteAllSessions();
            log.success('Session zote zimefutwa. Sasa itafanya pairing mpya.');
        }

        await startBot();
    } catch (err) {
        updateBanner('database', '❌ Error');
        log.error(`DB error: ${err.message}`);
        process.exit(1);
    }
})();
