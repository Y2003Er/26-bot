// index.js - FIXED v4.4.1 by 26-TECH (Updated with Active Notification + Restart Fix)
// Fix: Conditional Database Boot + Pairing Code Loop Deadlock Eliminated
// Hotfix: UnhandledRejection handler + Keepalive 4min + DB Pool max + Cache TTL

import dotenv from 'dotenv';
dotenv.config();

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception:', err);
});

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
    setupAutoStatusViewer
} from './lib/handler.js';
import {
    initializeDatabase,
    usePostgresAuthState,
    deleteAllSessions
} from './session-db.js';

import { initGroupProtection } from './commands/admin.js';
import { handleAntiLink } from './lib/antilink.js';

import pg from 'pg';
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});
global.dbPool = pool;

import { EventEmitter } from 'events';
EventEmitter.defaultMaxListeners = 20;

const aiCache = new NodeCache({ stdTTL: 60 });
const MAX_PER_CHAT = 20;
const chatMessagesCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
const processedMessages = new NodeCache({ stdTTL: 120, checkperiod: 60 });

const logger = pino({ level: process.env.DEBUG ? 'info' : 'silent' });
const PHONE_NUMBER = process.env.PHONE_NUMBER?.trim();
const SESSION_ID = process.env.SESSION_ID || '26_tech_v5';
const PAIRING_DELAY = 5000;

global.prefix = process.env.PREFIX || '.';

// ════════════════════════════════════════
// BANNER SYSTEM — 26-TECH Premium Dashboard v2.6.0
// ════════════════════════════════════════
const C = {
    reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
    cyan: '\x1b[36m', cyanBright: '\x1b[96m',
    green: '\x1b[32m', greenBright: '\x1b[92m',
    yellow: '\x1b[33m', yellowBright: '\x1b[93m',
    red: '\x1b[31m', redBright: '\x1b[91m',
    gray: '\x1b[90m', white: '\x1b[97m',
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
    ai: process.env.GROQ_API_KEY ? 'Groq + Gemini' : process.env.GEMINI_API_KEY ? 'Gemini' : '—',
    startTime: Date.now(),
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
    const used = (os.totalmem() - os.freemem()) / 1024 / 1024;
    const total = os.totalmem() / 1024 / 1024;
    const pct = (used / total) * 100;
    return { used: used.toFixed(0), total: total.toFixed(0), pct };
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

function makeBar(pct, width = 10) {
    const filled = Math.round((pct / 100) * width);
    const empty = width - filled;
    const color = pct > 85 ? C.redBright : pct > 60 ? C.yellowBright : C.greenBright;
    return `${color}${'▰'.repeat(filled)}${C.gray}${'▱'.repeat(empty)}${C.reset}`;
}

function connectionLine() {
    const s = bannerState.connection;
    if (s === 'ONLINE')      return `${C.greenBright}${C.bold}● ONLINE${C.reset}`;
    if (s === 'connecting')  return `${C.yellowBright}◌ CONNECTING${C.reset}`;
    if (s === 'OFFLINE')     return `${C.redBright}✖ OFFLINE${C.reset}`;
    return                          `${C.magentaBright}◈ MAINTENANCE${C.reset}`;
}

function databaseLine() {
    const d = bannerState.database;
    if (d.includes('✅')) return `${C.greenBright}● Connected${C.reset}`;
    if (d.includes('⏳')) return `${C.yellowBright}◌ Connecting...${C.reset}`;
    return                       `${C.redBright}✖ Disconnected${C.reset}`;
}

function pad(str, len) {
    // Strip ANSI codes for length calculation
    const plain = str.replace(/\x1b\[[0-9;]*m/g, '');
    const spaces = Math.max(0, len - plain.length);
    return str + ' '.repeat(spaces);
}

function printBanner() {
    const s = bannerState;
    const ram = getRAM();
    const cpu = parseFloat(getCPU());
    const W = 45; // inner width

    const border  = `${C.cyanBright}`;
    const pipe    = `${C.cyanBright}┃${C.reset}`;
    const sep     = `${C.cyanBright}├${'─'.repeat(W)}┤${C.reset}`;

    const row = (label, value) => {
        const labelStr = `${C.bold}${C.white}${label}${C.reset}`;
        const plainLabel = label;
        const plainValue = value.replace(/\x1b\[[0-9;]*m/g, '');
        const gap = W - plainLabel.length - plainValue.length - 4;
        return `${pipe}  ${labelStr}  ${value}${' '.repeat(Math.max(0, gap))} ${pipe}`;
    };

    const center = (text) => {
        const plain = text.replace(/\x1b\[[0-9;]*m/g, '');
        const total = W - plain.length;
        const left  = Math.floor(total / 2);
        const right = total - left;
        return `${pipe}${' '.repeat(left)}${text}${' '.repeat(right)}${pipe}`;
    };

    const blank = `${pipe}${' '.repeat(W)}${pipe}`;

    const ramBar   = makeBar(ram.pct);
    const ramBarPlain = '▰'.repeat(Math.round((ram.pct/100)*10)) + '▱'.repeat(10 - Math.round((ram.pct/100)*10));
    const ramLine  = `  ${ramBar}  ${C.blueBright}${ram.pct.toFixed(0)}%${C.reset}`;
    const ramInfo  = `  ${C.dim}${ram.used} MB / ${ram.total} MB${C.reset}`;

    const cpuBar   = makeBar(cpu);
    const cpuLine  = `  ${cpuBar}  ${C.blueBright}${cpu}%${C.reset}`;

    const lines = [
        `${border}╭${'━'.repeat(W)}╮${C.reset}`,
        blank,
        center(`${C.yellowBright}${C.bold}⚡ 26-𝐓𝐄𝐂𝐇  𝐁𝐎𝐓${C.reset}`),
        center(`${C.dim}◈  Advanced AI System Monitor  ◈${C.reset}`),
        blank,
        `${border}├${'─'.repeat(W)}┤${C.reset}`,
        `${pipe}  ${C.bold}${C.cyanBright}◉ SYSTEM STATUS${C.reset}${' '.repeat(W - 17)}${pipe}`,
        `${border}├${'─'.repeat(W)}┤${C.reset}`,
        row('🟢 Connection ', connectionLine()),
        row('🗄️  Database  ', databaseLine()),
        row('⏱️  Uptime    ', `${C.greenBright}${getUptime()}${C.reset}`),
        row('📡 Ping       ', `${C.yellowBright}— ms${C.reset}`),
        `${border}├${'─'.repeat(W)}┤${C.reset}`,
        `${pipe}  ${C.bold}${C.cyanBright}◈ BOT STATISTICS${C.reset}${' '.repeat(W - 18)}${pipe}`,
        `${border}├${'─'.repeat(W)}┤${C.reset}`,
        row('⚙️  Commands  ', `${C.greenBright}${s.commands}${C.reset}`),
        row('💬 Messages   ', `${C.white}${s.messages} total${C.reset}`),
        row('👥 Groups     ', `${C.white}${s.groups} active${C.reset}`),
        row('🤖 AI Engine  ', `${C.magentaBright}${s.ai}${C.reset}`),
        `${border}├${'─'.repeat(W)}┤${C.reset}`,
        `${pipe}  ${C.bold}${C.cyanBright}◈ RESOURCE MONITOR${C.reset}${' '.repeat(W - 20)}${pipe}`,
        `${border}├${'─'.repeat(W)}┤${C.reset}`,
        `${pipe}  ${C.bold}🧠 RAM Usage${C.reset}${' '.repeat(W - 13)}${pipe}`,
        `${pipe}${ramLine}${' '.repeat(Math.max(0, W - 18))}${pipe}`,
        `${pipe}${ramInfo}${' '.repeat(Math.max(0, W - ram.used.length - ram.total.length - 10))}${pipe}`,
        blank,
        `${pipe}  ${C.bold}⚡ CPU Usage${C.reset}${' '.repeat(W - 13)}${pipe}`,
        `${pipe}${cpuLine}${' '.repeat(Math.max(0, W - 18))}${pipe}`,
        `${border}├${'─'.repeat(W)}┤${C.reset}`,
        `${pipe}  ${C.bold}${C.cyanBright}◈ LAST ACTIVITY${C.reset}${' '.repeat(W - 17)}${pipe}`,
        `${border}├${'─'.repeat(W)}┤${C.reset}`,
        row('📨 Source     ', `${C.white}${s.lastSource}${C.reset}`),
        row('🕐 Time       ', `${C.white}${s.lastTime}${C.reset}`),
        `${pipe}  ${C.dim}💭 "${s.lastMsg.slice(0, 35)}${s.lastMsg.length > 35 ? '...' : ''}"${C.reset}${' '.repeat(Math.max(0, W - s.lastMsg.slice(0,35).length - 7))}${pipe}`,
        `${border}├${'─'.repeat(W)}┤${C.reset}`,
        center(`${C.dim}⚡ Powered by 26-TECH AI Infrastructure${C.reset}`),
        center(`${C.gray}◈ v2.6.0  •  2026 Edition  •  🔒 SEC${C.reset}`),
        `${border}╰${'━'.repeat(W)}╯${C.reset}`,
    ];

    console.log('');
    lines.forEach(line => console.log(line));
    console.log('');
}

function updateBanner(key, value) {
    if (value !== null && value !== undefined && key in bannerState) {
        bannerState[key] = value;
    }
}
// ════════════════════════════════════════
// END BANNER SYSTEM
// ════════════════════════════════════════

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
    const ownerNum = (process.env.OWNER_NUMBER || "255753495142").toString().trim();
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
let cacheCleanTimer = null;
let lastEventTime = Date.now();

function clearOpenTimer() {
    if (openTimer) clearTimeout(openTimer);
    openTimer = null;
}

function clearBackgroundTimers() {
    if (healthCheckTimer) clearInterval(healthCheckTimer);
    if (keepaliveTimer) clearInterval(keepaliveTimer);
    if (cacheCleanTimer) clearInterval(cacheCleanTimer);
    healthCheckTimer = keepaliveTimer = cacheCleanTimer = null;
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

function startHealthCheck() {
    if (healthCheckTimer) clearInterval(healthCheckTimer);
    healthCheckTimer = setInterval(async () => {
        const ws = global.sock?.ws?.readyState;
        const idleTime = Date.now() - lastEventTime;

        if (ws === 2 || ws === 3 || idleTime > 600000) {
            log.warn(`⚠️ Health Check: Dead connection detected. WS:${ws}, Idle:${Math.floor(idleTime / 1000)}s — inarestart...`);
            clearBackgroundTimers();
            isConnecting = false;
            bootLock = false;
            try { global.sock?.ws?.close(); } catch {}
            setTimeout(startBot, 5000);
        }
    }, 2 * 60 * 1000);
}

function startKeepalive() {
    if (keepaliveTimer) clearInterval(keepaliveTimer);
    keepaliveTimer = setInterval(async () => {
        try {
            if (global.sock?.ws?.readyState === 1) {
                await global.sock.sendPresenceUpdate('available');
                await global.sock.sendPresenceUpdate('unavailable');
                lastEventTime = Date.now();
            }
        } catch (e) {
            log.warn(`Keepalive imeshindwa: ${e.message}`);
        }
    }, 4 * 60 * 1000);
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

        if (global.sock) {
            try {
                global.sock.ev.removeAllListeners();
                await global.sock.ws?.close();
                global.sock.end?.(new Error('Restarting'));
            } catch {}
            global.sock = null;
            await new Promise(resolve => setTimeout(resolve, 2000));
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
        });

        global.sockInstance = global.sock;

        global.sock.ev.on('creds.update', async (update) => {
            try {
                await saveCreds(update);
            } catch (err) {
                log.error(`Creds save failed: ${err.message}`);
            }
        });

        setupContactListener(global.sock);

        let preKeyCount = 0;
        global.sock.ev.on('creds.update', () => {
            preKeyCount++;
            if (preKeyCount % 5 === 0) {
                log.info(`Pre-keys upload count: ${preKeyCount}`);
            }
        });

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

                resolveOwnerLid(global.sock);
                global.owner = process.env.OWNER_NUMBER || "255753495142";

                await Promise.allSettled([
                    global.sock.groupFetchAllParticipating().then(groups => {
                        updateBanner('groups', Object.keys(groups).length);
                    }),
                    Promise.resolve(setupAntiDelete(global.sock)),
                    Promise.resolve(setupAutoStatusViewer(global.sock)),
                    Promise.resolve(initGroupProtection(global.sock, logger)),
                ]);

                startHealthCheck();
                startKeepalive();
                startCacheCleanup();
                log.success('⚡ Health Check + Keepalive + Cache Cleanup — Zimeanzishwa');

                try {
                    const ownerJid = (global.owner || '255753495142').replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                    await global.sock.sendMessage(ownerJid, { text: '✅ *Bot iko active*' });
                    log.success('Ujumbe wa "Bot iko active" umetumwa kwa mmiliki');
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
            if (bannerState.messages % 10 === 0) {
                const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '[media]';
                const isGroup = jid.endsWith('@g.us');
                const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                const source = isGroup ? '👥 Group' : '💬 DM';
                updateBanner('messages', bannerState.messages);
                updateBanner('lastMsg', text.slice(0, 35));
                updateBanner('lastSource', source);
                updateBanner('lastTime', time);
                printBanner();
            }

            const botNumber = global.sock.user.id.replace(/:\d+@/, '@');
            const sender = msg.key.participant || jid;
            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
            const isMentioned = text.toLowerCase().includes('26-tech') ||
                msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.includes(botNumber);

            if (isMentioned && !msg.key.fromMe) {
                if (!aiCache.has(sender)) {
                    aiCache.set(sender, true);
                    if (!text.startsWith(global.prefix)) {
                        if (msg.message.conversation) msg.message.conversation = `${global.prefix}ai ${text}`;
                        else if (msg.message.extendedTextMessage) msg.message.extendedTextMessage.text = `${global.prefix}ai ${text}`;
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