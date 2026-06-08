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
import { loadCommands, handleMessage, setupContactListener } from './lib/handler.js';
import { initializeDatabase, usePostgresAuthState, deleteSession, deleteAllSessions } from './session-db.js';

const logger = pino({ level: 'silent' });
const PHONE_NUMBER = process.env.PHONE_NUMBER?.trim();
const SESSION_ID = process.env.SESSION_ID || '26_tech_v5';
const PAIRING_DELAY = 5000;
const CLEAN_SESSIONS = process.env.CLEAN_SESSIONS === 'true';

// ╔══════════════════════════════════════════════════════════╗
// ║              LIVE BANNER — ANSI CURSOR SYSTEM            ║
// ║  Banner inabaki juu, updates zinabadilisha mstari husika  ║
// ║  Logs zinaendelea chini bila kuvunja banner              ║
// ╚══════════════════════════════════════════════════════════╝

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

// ANSI cursor helpers
const ESC = {
    saveCursor:    '\x1b[s',
    restoreCursor: '\x1b[u',
    clearLine:     '\x1b[2K',
    moveUp:    (n) => `\x1b[${n}A`,
    moveDown:  (n) => `\x1b[${n}B`,
    col1:          '\x1b[1G',       // rudi mwanzo wa mstari
};

const bannerState = {
    connection: '⏳ Starting...',
    database:   '⏳ Connecting...',
    commands:   '0 loaded',
    messages:   0,
    groups:     0,
    lastMsg:    '—',
    ai:         process.env.GROQ_API_KEY ? 'Groq + Gemini' : process.env.GEMINI_API_KEY ? 'Gemini' : '—',
    startTime:  Date.now(),
};

// Hesabu mistari ya logs iliyochapishwa tangu banner
let logLineCount = 0;

// ── Banner row positions (0-based, kuanzia mstari wa kwanza wa banner) ──
// Mstari 0: ┌──────┐
// Mstari 1: │ ⚡ 26-TECH ... uptime
// Mstari 2: ├──────┤
// Mstari 3: │ ◈ Connection
// Mstari 4: │ 🗄️  Database
// Mstari 5: │ ⚡ Commands
// Mstari 6: │ 📨 Messages
// Mstari 7: │ 👥 Groups
// Mstari 8: │ 🤖 AI
// Mstari 9: │ 💾 RAM
// Mstari 10: ├──────┤
// Mstari 11: │ Last: ...
// Mstari 12: └──────┘
// Mstari 13: (blank)
// BANNER_TOTAL_LINES = 14

const BANNER_TOTAL_LINES = 14;

const BANNER_ROW = {
    uptime:     1,
    connection: 3,
    database:   4,
    commands:   5,
    messages:   6,
    groups:     7,
    ai:         8,
    ram:        9,
    lastMsg:    11,
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
    const used = ((os.totalmem() - os.freemem()) / 1024 / 1024).toFixed(0);
    const total = (os.totalmem() / 1024 / 1024).toFixed(0);
    return `${used}/${total} MB`;
}

function getConnectionContent() {
    const s = bannerState.connection;
    if (s === 'ONLINE')     return `${C.green}${C.bold}🟢 ONLINE${C.reset}`;
    if (s === 'connecting') return `${C.yellow}⏳ Connecting...${C.reset}`;
    if (s === 'OFFLINE')    return `${C.red}🔴 OFFLINE${C.reset}`;
    return `${C.yellow}${s}${C.reset}`;
}

function getDatabaseContent() {
    const s = bannerState.database;
    if (s.includes('✅')) return `${C.green}✅ Connected${C.reset}`;
    if (s.includes('❌')) return `${C.red}❌ Error${C.reset}`;
    return `${C.yellow}${s}${C.reset}`;
}

// ── Jenga maudhui ya mstari husika (bila border ya kushoto) ──
function buildBannerLine(key) {
    switch (key) {
        case 'uptime':
            return `${C.cyan}│${C.reset}  ${C.bold}${C.yellow}⚡ 26-𝐓𝐄𝐂𝐇${C.reset}               ${C.gray}uptime: ${getUptime()}${C.reset}`;
        case 'connection':
            return `${C.cyan}│${C.reset}  ${C.bold}◈ Connection${C.reset}  →  ${getConnectionContent()}`;
        case 'database':
            return `${C.cyan}│${C.reset}  ${C.bold}🗄️  Database${C.reset}   →  ${getDatabaseContent()}`;
        case 'commands':
            return `${C.cyan}│${C.reset}  ${C.bold}⚡ Commands${C.reset}   →  ${C.green}${bannerState.commands}${C.reset}`;
        case 'messages':
            return `${C.cyan}│${C.reset}  ${C.bold}📨 Messages${C.reset}   →  ${C.white}${bannerState.messages}${C.reset}`;
        case 'groups':
            return `${C.cyan}│${C.reset}  ${C.bold}👥 Groups${C.reset}     →  ${C.white}${bannerState.groups}${C.reset}`;
        case 'ai':
            return `${C.cyan}│${C.reset}  ${C.bold}🤖 AI${C.reset}         →  ${C.magenta}${bannerState.ai}${C.reset}`;
        case 'ram':
            return `${C.cyan}│${C.reset}  ${C.bold}💾 RAM${C.reset}        →  ${C.blue}${getRAM()}${C.reset}`;
        case 'lastMsg':
            return `${C.cyan}│${C.reset}  ${C.gray}Last: ${bannerState.lastMsg}${C.reset}`;
        default:
            return '';
    }
}

// ── Chapisha banner kamili mara moja mwanzoni ──
function printBanner() {
    const lines = [
        `${C.cyan}┌─────────────────────────────────────────────┐${C.reset}`,
        buildBannerLine('uptime'),
        `${C.cyan}├─────────────────────────────────────────────┤${C.reset}`,
        buildBannerLine('connection'),
        buildBannerLine('database'),
        buildBannerLine('commands'),
        buildBannerLine('messages'),
        buildBannerLine('groups'),
        buildBannerLine('ai'),
        buildBannerLine('ram'),
        `${C.cyan}├─────────────────────────────────────────────┤${C.reset}`,
        buildBannerLine('lastMsg'),
        `${C.cyan}└─────────────────────────────────────────────┘${C.reset}`,
        '',
    ];
    process.stdout.write(lines.join('\n') + '\n');
    logLineCount = 0; // reset counter baada ya kuchapisha banner
}

// ── Update mstari mmoja ndani ya banner bila kugusa logs ──
// value=null inaruhusu refresh tu bila kubadilisha state (uptime, ram)
function updateBanner(key, value) {
    // Hifadhi value mpya kwenye state — isipokuwa null (refresh tu)
    if (value !== null && value !== undefined && key in bannerState) {
        bannerState[key] = value;
    }

    const row = BANNER_ROW[key];
    if (row === undefined) return; // key haina row katika banner — skip

    const newLine = buildBannerLine(key);
    if (!newLine) return;

    // Mistari ya kurudi juu:
    //   - logLineCount = mistari ya logs chini ya banner
    //   - (BANNER_TOTAL_LINES - 1 - row) = umbali wa mstari husika kutoka chini ya banner
    const linesUp = logLineCount + (BANNER_TOTAL_LINES - 1 - row);
    if (linesUp < 1) return; // usalama — usirudi chini ya banner

    process.stdout.write(
        ESC.saveCursor          +   // hifadhi cursor ya sasa
        ESC.moveUp(linesUp)     +   // rudi juu hadi mstari husika
        ESC.col1                +   // nenda mwanzo wa mstari
        ESC.clearLine           +   // futa mstari wote
        newLine                 +   // chapisha mstari mpya wa banner
        ESC.restoreCursor           // rudisha cursor mahali ilikuwa
    );
}

// ── Intercept console.log/warn/error ili kuhesabu mistari ya logs ──
// Hifadhi originals KABLA ya kubadilisha
const _origLog   = console.log.bind(console);
const _origWarn  = console.warn.bind(console);
const _origError = console.error.bind(console);

// Tunafuta ANSI codes kwanza ili kupata urefu wa kweli wa mstari
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
const TERM_COLS = process.stdout.columns || 120;

function countOutputLines(args) {
    const raw = args.map(a => (typeof a === 'string' ? a : String(a))).join(' ');
    const clean = raw.replace(ANSI_RE, ''); // futa escape codes
    const parts = clean.split('\n');
    let total = 0;
    for (const part of parts) {
        // Hesabu word-wrap: mstari mrefu unaweza kuchukua mistari >1
        total += Math.max(1, Math.ceil(part.length / TERM_COLS));
    }
    return total;
}

console.log = (...args) => {
    logLineCount += countOutputLines(args);
    _origLog(...args);
};
console.warn = (...args) => {
    logLineCount += countOutputLines(args);
    _origWarn(...args);
};
console.error = (...args) => {
    logLineCount += countOutputLines(args);
    _origError(...args);
};

// ── Uptime update kila dakika 1 ──
setInterval(() => updateBanner('uptime', null), 60000);
// ── RAM update kila sekunde 30 ──
setInterval(() => updateBanner('ram', null), 30000);

// ── Chapisha banner mara moja sasa ──
printBanner();

// ════════════════════════════════════════════════
//        BOT LOGS
// ════════════════════════════════════════════════

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

let sock = null;
let isConnecting = false;
let pairingRequested = false;
let bootLock = false;
let openTimer = null;
let hasEverOpened = false;

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

    bootLock = true;
    isConnecting = true;
    pairingRequested = false;
    clearOpenTimer();

    try {
        await loadCommands();
        const cmdCount = global.allCommands?.size || 0;
        updateBanner('commands', `${cmdCount} loaded`);
        log.success('Commands zimepakiwa.');

        const { state, saveCreds } = await usePostgresAuthState(SESSION_ID);
        const msgRetryCounterCache = new NodeCache();

        if (sock) {
            try {
                sock.ev.removeAllListeners();
                await sock.ws?.close();
                sock.end?.(new Error('Restarting'));
            } catch (e) {}
            sock = null;
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        sock = makeWASocket({
            auth: state,
            msgRetryCounterCache,
            logger,
            printQRInTerminal: false,
            browser: Browsers.ubuntu('Chrome'),
            connectTimeoutMs: 120000,
            keepAliveIntervalMs: 30000,
            defaultQueryTimeoutMs: undefined,
            generateHighQualityLinkPreview: false,
            patchMessageBeforeSending: (msg) => msg,
        });

        sock.ev.on('creds.update', saveCreds);
        setupContactListener(sock);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection) {
                // Update banner moja kwa moja — si log
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

                log.div();
                log.success('BOT IMEUNGANIKA ✔');
                log.success('Session imehifadhiwa kwenye PostgreSQL (JSONB)');
                log.div();
                isConnecting = false;
                bootLock = false;
            }

            if (connection === 'close') {
                clearOpenTimer();
                const code = lastDisconnect?.error?.output?.statusCode;
                isConnecting = false;
                bootLock = false;
                updateBanner('connection', 'OFFLINE');

                if (code === 515) {
                    log.info('Pairing restart (515) — restarting in 2s...');
                    setTimeout(startBot, 2000);
                    return;
                }

                log.div();
                log.error(`Muunganiko Umevunjika → [${code ?? '?'}]`);

                if (code === 440) {
                    log.warn('Connection replaced (440) – waiting 15s before restart');
                    setTimeout(startBot, 15000);
                } else if (code === DisconnectReason.loggedOut || code === 401) {
                    log.warn('Session invalid. Inafuta session kutoka PostgreSQL...');
                    await deleteSession(SESSION_ID);
                    setTimeout(startBot, 10000);
                } else if (!hasEverOpened) {
                    log.warn('Haijaunganika kabla — restarting in 15s');
                    setTimeout(startBot, 15000);
                } else {
                    log.warn('Disconnect baada ya open — restarting in 7s');
                    setTimeout(startBot, 7000);
                }
            }
        });

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            const msg = messages[0];
            if (!msg.message) return;
            if (msg.key.fromMe) return;

            bannerState.messages++;
            const text =
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                '[media]';
            const isGroup = msg.key.remoteJid?.endsWith('@g.us');
            const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            const source = isGroup ? 'Group' : 'DM';

            // Update banner: messages count + lastMsg — si log
            updateBanner('messages', bannerState.messages);
            updateBanner('lastMsg', `${time} · ${source} · ${text.slice(0, 25)}${text.length > 25 ? '...' : ''}`);

            console.log(`📩 Ujumbe kutoka ${msg.key.remoteJid}: ${text}`);
            await handleMessage(sock, msg);
        });

        openTimer = setTimeout(() => {
            log.warn('Timeout — restart...');
            isConnecting = false;
            bootLock = false;
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
        bootLock = false;
        setTimeout(startBot, 7000);
    }
}

(async () => {
    try {
        log.info('Inaunganika na PostgreSQL...');
        await initializeDatabase();
        updateBanner('database', '✅ Connected');

        if (CLEAN_SESSIONS) {
            log.warn('🧹 CLEAN_SESSIONS=true – Inafuta session zote...');
            await deleteAllSessions();
            log.success('Session zote zimefutwa.');
        }

        await startBot();
    } catch (err) {
        updateBanner('database', '❌ Error');
        log.error(`DB error: ${err.message}`);
        process.exit(1);
    }
})();
