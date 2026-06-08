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

const logger = pino({ level: 'silent' }); // silent ili isivuruge banner
const PHONE_NUMBER = process.env.PHONE_NUMBER?.trim();
const SESSION_ID = process.env.SESSION_ID || '26_tech_v5';
const PAIRING_DELAY = 5000;
const CLEAN_SESSIONS = process.env.CLEAN_SESSIONS === 'true';

// ╔══════════════════════════════════════════════════════════╗
// ║                  LIVE BANNER SYSTEM                      ║
// ║  Inashughulikia state yote ya bot na kuionyesha          ║
// ║  real-time kwenye terminal bila kuvunja logs             ║
// ╚══════════════════════════════════════════════════════════╝
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

// Rows za banner — kila row ina urefu wa 43 chars ndani ya border
function pad(str, len = 43) {
    // Strip ANSI codes for length calculation
    const clean = str.replace(/\x1b\[[0-9;]*m/g, '');
    const spaces = len - clean.length;
    return str + ' '.repeat(Math.max(0, spaces));
}

const C = {
    reset:  '\x1b[0m',
    bold:   '\x1b[1m',
    cyan:   '\x1b[36m',
    green:  '\x1b[32m',
    yellow: '\x1b[33m',
    red:    '\x1b[31m',
    gray:   '\x1b[90m',
    white:  '\x1b[97m',
    blue:   '\x1b[34m',
    magenta:'\x1b[35m',
};

let bannerLines = 0; // track jinsi ya kurudi juu

function renderBanner() {
    const lines = [
        `${C.cyan}┌─────────────────────────────────────────────┐${C.reset}`,
        `${C.cyan}│${C.reset}  ${C.bold}${C.yellow}⚡ 26-𝐓𝐄𝐂𝐇${C.reset}          ${C.gray}uptime: ${getUptime()}${C.reset}`,
        `${C.cyan}├─────────────────────────────────────────────┤${C.reset}`,
        `${C.cyan}│${C.reset}  ${C.bold}◈ Connection${C.reset}  →  ${getConnectionColor()}`,
        `${C.cyan}│${C.reset}  ${C.bold}🗄️  Database${C.reset}   →  ${getDatabaseColor()}`,
        `${C.cyan}│${C.reset}  ${C.bold}⚡ Commands${C.reset}   →  ${C.green}${bannerState.commands}${C.reset}`,
        `${C.cyan}│${C.reset}  ${C.bold}📨 Messages${C.reset}   →  ${C.white}${bannerState.messages}${C.reset}`,
        `${C.cyan}│${C.reset}  ${C.bold}👥 Groups${C.reset}     →  ${C.white}${bannerState.groups}${C.reset}`,
        `${C.cyan}│${C.reset}  ${C.bold}🤖 AI${C.reset}         →  ${C.magenta}${bannerState.ai}${C.reset}`,
        `${C.cyan}│${C.reset}  ${C.bold}💾 RAM${C.reset}        →  ${C.blue}${getRAM()}${C.reset}`,
        `${C.cyan}├─────────────────────────────────────────────┤${C.reset}`,
        `${C.cyan}│${C.reset}  ${C.gray}Last: ${bannerState.lastMsg}${C.reset}`,
        `${C.cyan}└─────────────────────────────────────────────┘${C.reset}`,
    ];
    return lines;
}

function getConnectionColor() {
    const s = bannerState.connection;
    if (s.includes('ONLINE')) return `${C.green}${C.bold}🟢 ONLINE${C.reset}`;
    if (s.includes('connecting')) return `${C.yellow}⏳ Connecting...${C.reset}`;
    if (s.includes('close') || s.includes('OFFLINE')) return `${C.red}🔴 OFFLINE${C.reset}`;
    return `${C.yellow}${s}${C.reset}`;
}

function getDatabaseColor() {
    const s = bannerState.database;
    if (s.includes('✅')) return `${C.green}✅ Connected${C.reset}`;
    if (s.includes('❌')) return `${C.red}❌ Error${C.reset}`;
    return `${C.yellow}${s}${C.reset}`;
}

// Andika banner — rudi juu na uandike tena (live update)
function drawBanner() {
    if (bannerLines > 0) {
        // Rudi juu kwenye mstari wa kwanza wa banner
        process.stdout.write(`\x1b[${bannerLines}A`);
    }
    const lines = renderBanner();
    bannerLines = lines.length;
    process.stdout.write(lines.join('\n') + '\n');
}

// Log chini ya banner (haivunji banner)
const log = {
    _write: (prefix, msg, color) => {
        // Songa chini ya banner kwanza
        process.stdout.write('\n');
        console.log(`${color}  ${prefix}  ${msg}\x1b[0m`);
        // Redraw banner baada ya log
        setTimeout(drawBanner, 50);
    },
    info:    (msg) => log._write('✦', msg, C.white),
    success: (msg) => log._write('✔', msg, C.green),
    warn:    (msg) => log._write('⚠', msg, C.yellow),
    error:   (msg) => log._write('✖', msg, C.red),
    state:   (msg) => log._write('◈', msg, C.cyan),
    div:     ()    => log._write('─'.repeat(46), '', C.gray),
    blank:   ()    => { process.stdout.write('\n'); setTimeout(drawBanner, 50); },
};

// ╔══════════════════════════════════════════════╗
// ║  Update banner state na redraw               ║
// ╚══════════════════════════════════════════════╝
function updateBanner(key, value) {
    bannerState[key] = value;
    drawBanner();
}

// Draw banner mara moja mwanzoni
drawBanner();

// Refresh uptime kila sekunde
setInterval(drawBanner, 1000);

// ════════════════════════════════════════════════
//           ORIGINAL BOT CODE (unchanged)
// ════════════════════════════════════════════════

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
    process.stdout.write('\n');
    console.log('\n╔══════════════════════════╗');
    console.log('║   🔑 PAIRING CODE        ║');
    console.log('╠══════════════════════════╣');
    console.log(`║      ${code}      ║`);
    console.log('╚══════════════════════════╝');
    console.log(`\n📋 CODE: ${code}\n`);
    console.log('👆 WhatsApp → Linked Devices → Link a Device');
    console.log('👆 Link with phone number → Weka namba yako');
    console.log('👆 Popup itatokea yenyewe — bonyeza CONFIRM\n');
    setTimeout(drawBanner, 100);
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

                // Pata groups count
                try {
                    const groups = await sock.groupFetchAllParticipating();
                    updateBanner('groups', Object.keys(groups).length);
                } catch {}

                log.success('BOT IMEUNGANIKA ✔');
                log.success('Session imehifadhiwa kwenye PostgreSQL (JSONB)');
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

            // Update banner stats
            bannerState.messages++;
            const text =
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                '[media]';
            const isGroup = msg.key.remoteJid?.endsWith('@g.us');
            const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            const source = isGroup ? `Group` : `DM`;
            updateBanner('lastMsg', `${time} · ${source} · ${text.slice(0, 25)}${text.length > 25 ? '...' : ''}`);

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
