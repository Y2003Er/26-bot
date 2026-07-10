// index.js - FIXED v4.5.0 by 26-TECH (Comprehensive Stability)
import dotenv from 'dotenv';
dotenv.config();

// ✅ Owner number LAZIMA itoke .env — hakuna hardcoded fallback
if (!process.env.OWNER_NUMBER || !/^\d{9,15}$/.test(process.env.OWNER_NUMBER.replace(/[^0-9]/g, ''))) {
    console.error('❌ OWNER_NUMBER haijawekwa sahihi kwenye .env! Mfano: OWNER_NUMBER=255753495142');
    process.exit(1);
}

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception:', err);
});

import os from 'os';
import pino from 'pino';
import NodeCache from 'node-cache';
import express from 'express';
import cors from 'cors';
import {
    default as makeWASocket,
    DisconnectReason,
    Browsers,
} from '@whiskeysockets/baileys';

import './config.js';
import { sendStartupMsg, ANTIDELETE, autoViewStatus, chatbot } from './config.js';
import {
    loadCommands,
    handleMessage,
    setupContactListener,
    setupAntiDelete,
    groupMetaCache,
    setupAutoStatusViewer,
    setupAutoBio,
    setupWelcome,
    setupAntiTag,
    setupAntiCall,
    setupAntiTemu
} from './lib/handler.js';
import {
    initializeDatabase,
    usePostgresAuthState,
    deleteAllSessions
} from './session-db.js';

import { initGroupProtection } from './commands/admin.js';
import { handleAntiLink } from './lib/antilink.js';
import pairingRouter from './pairing.js';

// ✅ FIX C-2: Tumia shared pool badala ya pool mpya
import { getPool } from './lib/db.js';
global.dbPool = getPool();

import { EventEmitter } from 'events';
EventEmitter.defaultMaxListeners = 20;

// ═══════════════════════════════
// PAIRING API SERVER
// ═══════════════════════════════
const pairApp = express();
pairApp.use(cors());
pairApp.use(express.json());
pairApp.use(pairingRouter);

pairApp.get("/health", (req, res) => {
    res.json({
        status: "ok",
        botName: "26-TECH BOT",
        uptime: process.uptime(),
        connection: bannerState.connection,
        messages: bannerState.messages,
        groups: bannerState.groups,
        ping: bannerState.ping,
    });
});

const PORT = process.env.PORT || 8080;
pairApp.listen(PORT, () => {
    console.log(` ✔ ⚡ Pairing API imeanza kwenye port ${PORT}`);
});

const aiCache = new NodeCache({ stdTTL: 60 });
const MAX_PER_CHAT = 20;
const chatMessagesCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
const processedMessages = new NodeCache({ stdTTL: 120, checkperiod: 60 });

const logger = pino({ level: process.env.DEBUG ? 'info' : 'silent' });
const PHONE_NUMBER = process.env.PHONE_NUMBER?.trim();
const SESSION_ID = process.env.SESSION_ID || '26_tech_v5';
const PAIRING_DELAY = 5000;

global.prefix = process.env.PREFIX || '.';

// ════════════════
// BANNER SYSTEM — 26-TECH Premium Dashboard v2.6.0
// ════════════════
const C = {
    reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
    cyan: '\x1b[36m', cyanBright: '\x1b[96m',
    green: '\x1b[32m', greenBright: '\x1b[92m',
    yellow: '\x1b[33m', yellowBright: '\x1b[93m',
    red: '\x1b[31m', redBright: '\x1b[91m',
    gray: '\x1b[90m', white: '\x1b[97m',  // ✅ FIX L-1: 'w' → 'm'
    blue: '\x1b[34m', blueBright: '\x1b[94m',
    magenta: '\x1b[35m', magentaBright: '\x1b[95m',
};

const bannerState = {
    connection: 'connecting',
    database: '⏳ Connecting...',
    commands: '0 loaded',
    messages: 0,
    groups: 0,
    lastMsg: '—',
    lastSource: '—',
    lastTime: '—',
    ping: '—',
    restarts: 0,
    ai: process.env.GROQ_API_KEY ? 'Groq + Gemini' : process.env.GEMINI_API_KEY ? 'Gemini' : '—',
    startTime: Date.now(),
};

let pulseState = 0;
const pulseFrames = [
    `\x1b[92m\x1b[1m●\x1b[0m`,
    `\x1b[32m●\x1b[0m`,
    `\x1b[92m\x1b[1m●\x1b[0m`,
    `\x1b[32m\x1b[2m●\x1b[0m`,
];
let pulseTimer = null;

function startPulse() {
    if (pulseTimer) clearInterval(pulseTimer);
    pulseTimer = setInterval(() => {
        if (bannerState.connection !== 'ONLINE') {
            stopPulse();
            return;
        }
        pulseState = (pulseState + 1) % pulseFrames.length;
    }, 600);
}

function stopPulse() {
    if (pulseTimer) clearInterval(pulseTimer);
    pulseTimer = null;
    pulseState = 0;
}

function getUptime() {
    const sec = Math.floor((Date.now() - bannerState.startTime) / 1000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

Function getRAM() {
    const mem = process.memoryUsage();
    const used = mem.heapUsed / 1024 / 1024;
    
    // Chukua limit halisi ya Node
    const v8 = require('v8');
    const total = v8.getHeapStatistics().heap_size_limit / 1024 / 1024;
    
    const pct = (used / total) * 100;
    return { used: used.toFixed(1), total: total.toFixed(1), pct: pct.toFixed(0) };
}

function getCPU() {
    const cpus = os.cpus();
    const avg = cpus.reduce((acc, cpu) => {
        const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
        const idle = cpu.times.idle;
        return acc + ((total - idle) / total) * 100;
    }, 0) / cpus.length;
    return avg.toFixed(1);
}

async function measurePing() {
    const start = Date.now();
    try {
        if (global.sock?.ws?.readyState === 1) {
            await global.sock.sendPresenceUpdate('available');
            return Date.now() - start;
        }
        return '—';
    } catch {
        return '—';
    }
}

function makeBar(pct, width = 10) {
    const filled = Math.round((pct / 100) * width);
    const empty = width - filled;
    const color = pct > 85 ? C.redBright : pct > 60 ? C.yellowBright : C.greenBright;
    return `${color}${'▰'.repeat(filled)}${C.gray}${'▱'.repeat(empty)}${C.reset}`;
}

function connectionLine() {
    const s = bannerState.connection;
    if (s === 'ONLINE') return `${pulseFrames[pulseState]} ${C.greenBright}${C.bold}ONLINE${C.reset}`;
    if (s === 'connecting') return `${C.yellowBright}◌ CONNECTING${C.reset}`;
    if (s === 'OFFLINE') return `${C.redBright}✖ OFFLINE${C.reset}`;
    return `${C.magentaBright}◈ MAINTENANCE${C.reset}`;
}

function databaseLine() {
    const d = bannerState.database;
    if (d.includes('✅')) return `${C.greenBright}● Connected${C.reset}`;
    if (d.includes('⏳')) return `${C.yellowBright}◌ Connecting...${C.reset}`;
    return `${C.redBright}✖ Disconnected${C.reset}`;
}

function printBanner() {
    const s = bannerState;
    const ram = getRAM();
    const cpu = parseFloat(getCPU());
    const W = 45;

    const pipe = `${C.cyanBright}┃${C.reset}`;
    const topB = `${C.cyanBright}╭${'━'.repeat(W)}╮${C.reset}`;
    const botB = `${C.cyanBright}╰${'━'.repeat(W)}╯${C.reset}`;
    const sep = `${C.cyanBright}├${'─'.repeat(W)}┤${C.reset}`;
    const blank = `${pipe}${' '.repeat(W)}${pipe}`;

    const center = (text) => {
        const plain = text.replace(/\x1b\[[0-9;]*m/g, '');
        const total = W - plain.length;
        const left = Math.floor(total / 2);
        const right = total - left;
        return `${pipe}${' '.repeat(left)}${text}${' '.repeat(right)}${pipe}`;
    };

    const row = (emoji, label, value) => {
        const plainValue = value.replace(/\x1b\[[0-9;]*m/g, '');
        const lineContent = ` ${emoji} ${C.bold}${C.white}${label}${C.reset} ${value}`;
        const plainLine = ` ${emoji} ${label} ${plainValue}`;
        const pad = Math.max(0, W - plainLine.length - 1);
        return `${pipe}${lineContent}${' '.repeat(pad)}${pipe}`;
    };

    const sectionHeader = (icon, title) => {
        const text = `${icon} ${C.bold}${C.cyanBright}${title}${C.reset}`;
        const plain = `${icon} ${title}`;
        const pad = Math.max(0, W - plain.length - 2);
        return `${pipe} ${text}${' '.repeat(pad)}${pipe}`;
    };

    const ramBar = makeBar(ram.pct);
    const cpuBar = makeBar(cpu);

    const ramBarLine = ` ${ramBar} ${C.blueBright}${ram.pct.toFixed(0)}%${C.reset}`;
    const ramBarPlain = ` ${'▰'.repeat(10)} ${ram.pct.toFixed(0)}%`;

    const cpuBarLine = ` ${cpuBar} ${C.blueBright}${cpu}%${C.reset}`;
    const cpuBarPlain = ` ${'▰'.repeat(10)} ${cpu}%`;

    const ramInfoLine = ` ${C.dim}${ram.used} MB / ${ram.total} MB${C.reset}`;
    const ramInfoPlain = ` ${ram.used} MB / ${ram.total} MB`;

    const lastMsgTxt = s.lastMsg.slice(0, 32);
    const lastMsgLine = ` ${C.dim}💭 "${lastMsgTxt}${s.lastMsg.length > 32 ? '...' : ''}"${C.reset}`;
    const lastMsgPlain = ` 💭 "${lastMsgTxt}${s.lastMsg.length > 32 ? '...' : ''}"`;

    console.log('');
    console.log(topB);
    console.log(blank);
    console.log(center(`${C.yellowBright}${C.bold}⚡ 26-𝐓𝐄𝐂𝐇 𝐁𝐎𝐓${C.reset}`));
    console.log(center(`${C.dim}◈ Advanced AI System Monitor ◈${C.reset}`));
    console.log(blank);
    console.log(sep);
    console.log(sectionHeader('◉', 'SYSTEM STATUS'));
    console.log(sep);
    console.log(row('🟢', 'Connection ', connectionLine()));
    console.log(row('🗄️ ', 'Database ', databaseLine()));
    console.log(row('⏱️ ', 'Uptime ', `${C.greenBright}${getUptime()}${C.reset}`));
    console.log(row('📡', 'Ping ', `${C.yellowBright}${s.ping}${typeof s.ping === 'number' ? ' ms' : ''}${C.reset}`));
    console.log(row('🔄', 'Restarts ', `${C.white}${s.restarts}x${C.reset}`));
    console.log(sep);
    console.log(sectionHeader('◈', 'BOT STATISTICS'));
    console.log(sep);
    console.log(row('⚙️ ', 'Commands ', `${C.greenBright}${s.commands}${C.reset}`));
    console.log(row('💬', 'Messages ', `${C.white}${s.messages} total${C.reset}`));
    console.log(row('👥', 'Groups ', `${C.white}${s.groups} active${C.reset}`));
    console.log(row('🤖', 'AI Engine ', `${C.magentaBright}${s.ai}${C.reset}`));
    console.log(sep);
    console.log(sectionHeader('◈', 'RESOURCE MONITOR'));
    console.log(sep);
    console.log(`${pipe} ${C.bold}🧠 RAM Usage${C.reset}${' '.repeat(W - 13)}${pipe}`);
    console.log(`${pipe}${ramBarLine}${' '.repeat(Math.max(0, W - ramBarPlain.length))}${pipe}`);
    console.log(`${pipe}${ramInfoLine}${' '.repeat(Math.max(0, W - ramInfoPlain.length))}${pipe}`);
    console.log(blank);
    console.log(`${pipe} ${C.bold}⚡ CPU Usage${C.reset}${' '.repeat(W - 13)}${pipe}`);
    console.log(`${pipe}${cpuBarLine}${' '.repeat(Math.max(0, W - cpuBarPlain.length))}${pipe}`);
    console.log(sep);
    console.log(sectionHeader('◈', 'LAST ACTIVITY'));
    console.log(sep);
    console.log(row('📨', 'Source ', `${C.white}${s.lastSource}${C.reset}`));
    console.log(row('🕐', 'Time ', `${C.white}${s.lastTime}${C.reset}`));
    console.log(`${pipe}${lastMsgLine}${' '.repeat(Math.max(0, W - lastMsgPlain.length))}${pipe}`);
    console.log(sep);
    console.log(center(`${C.dim}⚡ Powered by 26-TECH AI Infrastructure${C.reset}`));
    console.log(center(`${C.gray}◈ v2.6.0 • 2026 Edition • 🔒 SEC${C.reset}`));
    console.log(botB);
    console.log('');
}

function updateBanner(key, value) {
    if (value !== null && value !== undefined && key in bannerState) {
        bannerState[key] = value;
    }
}

const log = {
    info: (msg) => console.log(` ✦ ${msg}`),
    success: (msg) => console.log(` ✔ ${msg}`),
    warn: (msg) => console.warn(` ⚠ ${msg}`),
    error: (msg) => console.error(` ✖ ${msg}`),
    state: (msg) => console.log(` ◈ ${msg}`),
    div: () => console.log(` ${'─'.repeat(46)}`),
};

global.isOwner = (jid) => {
    if (!jid) return false;
    const ownerNum = process.env.OWNER_NUMBER.toString().trim();
    const normalize = (str) => String(str).split(':')[0].replace(/@lid|@s.whatsapp.net/, '').replace(/[^0-9]/g, '');
    const senderClean = normalize(jid);
    const ownerClean = normalize(ownerNum);
    if (senderClean === ownerClean || String(jid).includes(ownerNum)) return true;
    if (String(jid).endsWith('@lid') && global.ownerLid) {
        if (normalize(jid) === normalize(global.ownerLid)) return true;
    }
    return false;
};

global.isSockReady = () => global.sock?.ws && global.sock.ws.readyState === 1;

function resolveOwnerLid(sock) {
    let lid = sock.user?.lid || sock.authState?.creds?.me?.lid;
    if (lid) {
        const fullLid = lid.endsWith('@lid') ? lid : `${lid}@lid`;
        global.ownerLid = fullLid;
        log.success(`Owner LID imesetiwa: ${fullLid}`);
        return fullLid;
    }
    return null;
}

if (!process.env.DATABASE_URL) {
    log.error('DATABASE_URL haipo — Bot imesimama.');
    process.exit(1);
}
if (!PHONE_NUMBER || !/^\d{10,15}$/.test(PHONE_NUMBER)) {
    log.error('PHONE_NUMBER si sahihi (mfano: 255753495142)');
    process.exit(1);
}

global.sock = null;
let isConnecting = false;
let pairingRequested = false;
let pairingDone = false;
let bootLock = false;
let openTimer = null;
let hasEverOpened = false;
let consecutiveConflicts = 0;
const MAX_CONFLICTS = 3;

let healthCheckTimer = null;
let keepaliveTimer = null;
let aggressiveKeepaliveTimer = null;
let cacheCleanTimer = null;
let lastEventTime = Date.now();

function clearOpenTimer() {
    if (openTimer) clearTimeout(openTimer);
    openTimer = null;
}

function clearBackgroundTimers() {
    if (healthCheckTimer) clearInterval(healthCheckTimer);
    if (keepaliveTimer) clearInterval(keepaliveTimer);
    if (aggressiveKeepaliveTimer) clearInterval(aggressiveKeepaliveTimer);
    if (cacheCleanTimer) clearInterval(cacheCleanTimer);
    stopPulse();
    healthCheckTimer = keepaliveTimer = aggressiveKeepaliveTimer = cacheCleanTimer = null;
}

function displayPairingCode(code) {
    console.log('\n╔══════════╗');
    console.log('║ 🔑 PAIRING CODE ║');
    console.log('╠══════════╣');
    console.log(`║ ${code} ║`);
    console.log('╚══════════╝');
    console.log(`\n📋 CODE: ${code}\n`);
}

function startCacheCleanup() {
    if (cacheCleanTimer) clearInterval(cacheCleanTimer);
    cacheCleanTimer = setInterval(() => {
        try {
            const stats = processedMessages.getStats();
            log.info(`🧹 Cache cleanup: processedMessages ${stats.keys} keys`);
        } catch (e) {
            log.warn(`Cache cleanup error: ${e.message}`);
        }
    }, 10 * 60 * 1000);
}

// ✅ FIX M-3: AGGRESSIVE KEEP-ALIVE - Tuma presence updates every 90 seconds
// to prevent cloud provider idle timeouts
function startAggressiveKeepalive() {
    if (aggressiveKeepaliveTimer) clearInterval(aggressiveKeepaliveTimer);
    aggressiveKeepaliveTimer = setInterval(async () => {
        try {
            if (global.sock?.ws?.readyState === 1) {
                // Send availability to wake up idle connections
                await global.sock.sendPresenceUpdate('available');
                // Send a dummy ping message to keep WebSocket active
                try {
                    await global.sock.sendPresenceUpdate('typing');
                    await new Promise(r => setTimeout(r, 500));
                    await global.sock.sendPresenceUpdate('paused');
                } catch (e) {
                    // Silently fail - these are optional pings
                }
                lastEventTime = Date.now();
                log.info(`🔄 Aggressive keepalive → presence update sent`);
            }
        } catch (e) {
            log.warn(`Aggressive keepalive error: ${e.message}`);
        }
    }, 90 * 1000); // 90 seconds - more aggressive than standard 2min
}

function startHealthCheck() {
    if (healthCheckTimer) clearInterval(healthCheckTimer);
    healthCheckTimer = setInterval(async () => {
        const ws = global.sock?.ws?.readyState;
        const idleTime = Date.now() - lastEventTime;

        // ✅ FIX M-1: Punguza kutoka 600000 (10min) → 180000 (3min)
        // More aggressive idle detection
        if (ws === 2 || ws === 3 || idleTime > 180000) {
            log.warn(`⚠️ Health Check: Dead connection detected. WS:${ws}, Idle:${Math.floor(idleTime / 1000)}s — inarestart...`);
            clearBackgroundTimers();
            isConnecting = false;
            bootLock = false;
            try { global.sock?.ws?.close(); } catch {}
            setTimeout(startBot, 5000);
        }
    }, 60 * 1000); // Check every 60 seconds instead of 120
}

function startKeepalive() {
    if (keepaliveTimer) clearInterval(keepaliveTimer);
    keepaliveTimer = setInterval(async () => {
        try {
            if (global.sock?.ws?.readyState === 1) {
                // ✅ FIX M-2: Tuma 'available' mara moja tu, ondoa 'unavailable'
                await global.sock.sendPresenceUpdate('available');
                lastEventTime = Date.now();
                const ping = await measurePing();
                updateBanner('ping', ping);
            }
        } catch (e) {
            log.warn(`Keepalive imeshindwa: ${e.message}`);
        }
    }, 2 * 60 * 1000); // 2 minutes instead of 4
}

// ✅ FIX E-1: PROPER SOCKET CLEANUP — Ondoa listeners kabla ya kufa
async function cleanupOldSocket(oldSock) {
    if (!oldSock) return;
    try {
        if (oldSock.ev) {
            oldSock.ev.removeAllListeners();
            oldSock.ev.removeAllListeners('connection.update');
            oldSock.ev.removeAllListeners('messages.upsert');
            oldSock.ev.removeAllListeners('messages.update');
            oldSock.ev.removeAllListeners('creds.update');
        }
        if (oldSock.ws) {
            try { await oldSock.ws.close(); } catch {}
        }
        if (oldSock.end) {
            try { await oldSock.end(new Error('Graceful shutdown')); } catch {}
        }
    } catch (e) {
        log.warn(`Socket cleanup error: ${e.message}`);
    }
    // ✅ FIX E-2: Longer wait time (5s instead of 2s) para matigichukuzwe migrations
    await new Promise(resolve => setTimeout(resolve, 5000));
}

async function startBot() {
    if (bootLock || isConnecting) return;
    if (global.sock?.ws?.readyState === 1 && (Date.now() - lastEventTime) < 600000) return;

    bootLock = true;
    isConnecting = true;
    lastEventTime = Date.now();
    clearOpenTimer();
    clearBackgroundTimers();

    try {
        await loadCommands();
        const cmdCount = global.allCommands?.size || 0;
        updateBanner('commands', `${cmdCount} loaded`);
        printBanner();

        const { state, saveCreds } = await usePostgresAuthState(SESSION_ID);
        const isRegistered = !!(state.creds?.me || state.creds?.account || state.creds?.registered);

        if (isRegistered) {
            log.success('✅ DATABASE CHECK: Session ipo hai. Amri zote za pairing zimefungwa.');
            pairingDone = true;
            pairingRequested = true;
        } else {
            log.warn('⚠️ DATABASE CHECK: Database ipo tupu. Inahitaji kusajiliwa upya.');
            pairingDone = false;
            pairingRequested = false;
        }

        const msgRetryCounterCache = new NodeCache();

        // ✅ FIX E-1: PROPER CLEANUP before creating new socket
        if (global.sock) {
            await cleanupOldSocket(global.sock);
            global.sock = null;
        }

        global.sock = makeWASocket({
            auth: state,
            msgRetryCounterCache,
            logger,
            printQRInTerminal: false,
            browser: Browsers.ubuntu('Chrome'),
            connectTimeoutMs: 45000,
            keepAliveIntervalMs: 30000,
            generateHighQualityLinkPreview: false,
            retryRequestDelayMs: 2000,
            maxRetries: 5,
            syncFullHistory: false,
            shouldSyncHistory: () => false,
            markOnlineOnConnect: true,
            emitOwnEvents: false,
            // ✅ Baileys v7 rc13: epuka rate-limit/ban kwa kutumia cached group metadata
            cachedGroupMetadata: async (jid) => groupMetaCache.get(jid),
        });

        global.sockInstance = global.sock;

        // ✅ FIX C-8: Unganisha listeners mbili za creds.update kuwa moja
        let preKeyCount = 0;
        global.sock.ev.on('creds.update', async (update) => {
            try {
                preKeyCount++;
                if (preKeyCount % 5 === 0) {
                    log.info(`Pre-keys upload count: ${preKeyCount}`);
                }
                await saveCreds(update);
            } catch (err) {
                log.error(`Creds save failed: ${err.message}`);
            }
        });

        setupContactListener(global.sock);

        const updateLastEvent = () => { lastEventTime = Date.now(); };
        global.sock.ev.on('connection.update', updateLastEvent);
        global.sock.ev.on('messages.upsert', updateLastEvent);
        global.sock.ev.on('messages.update', updateLastEvent);

        global.sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection) {
                updateBanner('connection', connection === 'open' ? 'ONLINE' : connection);
                log.state(`Connection → ${connection}`);
            }

            if (connection === 'connecting' && !isRegistered && !pairingRequested && !pairingDone) {
                pairingRequested = true;
                log.info(`Subiri sekunde ${PAIRING_DELAY / 1000} kabla ya kuomba pairing code...`);
                setTimeout(async () => {
                    try {
                        if (global.sock?.authState?.creds?.me || state.creds?.me) {
                            log.success('Session imepatikana sekunde ya mwisho! Pairing imesitishwa.');
                            pairingDone = true;
                            return;
                        }
                        const code = await global.sock.requestPairingCode(PHONE_NUMBER);
                        displayPairingCode(code);
                        pairingDone = true;
                    } catch (err) {
                        log.error(`Pairing error: ${err.message}`);
                        pairingRequested = false;
                    }
                }, PAIRING_DELAY);
            }

            if (connection === 'open') {
                clearOpenTimer();
                hasEverOpened = true;
                consecutiveConflicts = 0;
                pairingDone = true;
                pairingRequested = true;
                updateBanner('connection', 'ONLINE');
                updateBanner('restarts', bannerState.restarts + 1);

                resolveOwnerLid(global.sock);
                global.owner = process.env.OWNER_NUMBER;

                measurePing().then(ms => {
                    updateBanner('ping', ms);
                });

                await Promise.allSettled([
                    global.sock.groupFetchAllParticipating().then(groups => {
                        updateBanner('groups', Object.keys(groups).length);
                    }),
                    ANTIDELETE ? Promise.resolve(setupAntiDelete(global.sock)) : Promise.resolve(),
                    autoViewStatus ? Promise.resolve(setupAutoStatusViewer(global.sock)) : Promise.resolve(),
                    Promise.resolve(initGroupProtection(global.sock, logger)),
                    Promise.resolve(setupAutoBio(global.sock)),
                    Promise.resolve(setupWelcome(global.sock)),
                    Promise.resolve(setupAntiTag(global.sock)),
                    Promise.resolve(setupAntiCall(global.sock)),
                    Promise.resolve(setupAntiTemu(global.sock)),
                ]);

                startHealthCheck();
                startKeepalive();
                startAggressiveKeepalive();
                startCacheCleanup();
                startPulse();
                log.success('⚡ Health Check + Keepalive (2min) + Aggressive Keepalive (90s) + Cache Cleanup + Pulse — Zimeanzishwa');

                try {
                    if (sendStartupMsg) {
                        const ownerJid = global.owner.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                        await global.sock.sendMessage(ownerJid, { text: '✅ *Bot iko active*' });
                        log.success('Ujumbe wa "Bot iko active" umetumwa kwa mmiliki');
                    }
                } catch (err) {
                    log.warn(`Imeshindwa kutuma notification ya active: ${err.message}`);
                }

                log.success('BOT IMEUNGANIKA ✔');
                printBanner();

                isConnecting = false;
                bootLock = false;
            }

            if (connection === 'close') {
                clearOpenTimer();
                clearBackgroundTimers();
                const code = lastDisconnect?.error?.output?.statusCode;
                isConnecting = false;
                bootLock = false;
                updateBanner('connection', 'OFFLINE');
                updateBanner('ping', '—');

                log.error(`Muunganiko Umevunjika → [${code ?? '?'}]`);

                if (code === 440) {
                    consecutiveConflicts++;
                    const waitMs = consecutiveConflicts >= MAX_CONFLICTS ? 60000 : 15000;
                    log.warn(`⚠️ Session conflict (${consecutiveConflicts}/${MAX_CONFLICTS}) — kusubiri ${waitMs / 1000}s...`);
                    if (consecutiveConflicts >= MAX_CONFLICTS) consecutiveConflicts = 0;
                    setTimeout(startBot, waitMs);
                } else {
                    setTimeout(startBot, 7000);
                }
            }
        });

        global.sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            const msg = messages[0];
            if (!msg.message) return;

            if (processedMessages.get(msg.key.id)) return;
            processedMessages.set(msg.key.id, true);

            const jid = msg.key.remoteJid;
            if (!jid) return;

            let currentChatHistory = chatMessagesCache.get(jid) || [];
            currentChatHistory.push(msg.key.id);
            if (currentChatHistory.length > MAX_PER_CHAT) currentChatHistory.shift();
            chatMessagesCache.set(jid, currentChatHistory);

            bannerState.messages++;
            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '[media]';
            const isGroup = jid.endsWith('@g.us');
            const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            const source = isGroup ? '👥 Group' : '💬 DM';
            updateBanner('messages', bannerState.messages);
            updateBanner('lastMsg', text.slice(0, 35));
            updateBanner('lastSource', source);
            updateBanner('lastTime', time);

            if (bannerState.messages % 5 === 0) {
                printBanner();
            }

            const botNumber = global.sock.user.id.replace(/:\d+@/, '@');
            const sender = msg.key.participant || jid;
            const textRaw = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
            const isMentioned = textRaw.toLowerCase().includes('26-tech') ||
                msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.includes(botNumber);

            // ✅ CHATBOT — kama false, mention haita-trigger AI auto-reply
            if (chatbot && isMentioned && !msg.key.fromMe) {
                if (!aiCache.has(sender)) {
                    aiCache.set(sender, true);
                    if (!textRaw.startsWith(global.prefix)) {
                        if (msg.message.conversation) msg.message.conversation = `${global.prefix}ai ${textRaw}`;
                        else if (msg.message.extendedTextMessage) msg.message.extendedTextMessage.text = `${global.prefix}ai ${textRaw}`;
                    }
                }
            }

            const extra = {
                from: jid,
                sender: sender,
                prefix: global.prefix,
                reply: async (txt) => {
                    try {
                        await global.sock.sendMessage(jid, { text: txt }, { quoted: msg });
                    } catch (e) {
                        log.warn(`Send message failed: ${e.message}`);
                    }
                }
            };

            await Promise.allSettled([
                handleAntiLink(global.sock, msg, logger),
                handleMessage(global.sock, msg, extra),
            ]);
        });

        openTimer = setTimeout(() => {
            log.warn('Timeout — restarting...');
            isConnecting = false;
            bootLock = false;
            try { global.sock?.ws?.close(); } catch {}
            setTimeout(startBot, 7000);
        }, 180000);

    } catch (err) {
        log.error(`HITILAFU → ${err.message}`);
        isConnecting = false;
        bootLock = false;
        clearBackgroundTimers();
        setTimeout(startBot, 7000);
    }
}

global.startBot = startBot;

(async () => {
    try {
        log.info('Inaunganika na PostgreSQL...');
        await initializeDatabase();
        updateBanner('database', '✅ Connected');

        if (process.env.CLEAN_SESSIONS === 'true') {
            log.warn('CLEAN_SESSIONS=true — Inafuta session zote...');
            await deleteAllSessions();
            log.success('Session zote zimefutwa.');
        }

        await startBot();
    } catch (err) {
        log.error(`DB error: ${err.message}`);
        process.exit(1);
    }
})();
