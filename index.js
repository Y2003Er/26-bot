// index.js - FIXED v4 by 26-TECH
// Fix: Dead connection detection + force restart

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
    setupAutoStatusViewer
} from './lib/handler.js';
import {
    initializeDatabase,
    usePostgresAuthState,
    deleteAllSessions
} from './session-db.js';

import { initGroupProtection } from './commands/admin.js';
import { handleAntiLink } from './lib/antilink.js';

// ── Database Pool kwa $db commands ──
import pg from 'pg';
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});
global.dbPool = pool;

// ── Fix MaxListeners Warning ──
import { EventEmitter } from 'events';
EventEmitter.defaultMaxListeners = 20;

// ── Caches ──
const aiCache = new NodeCache({ stdTTL: 60 });
const MAX_PER_CHAT = 20;
const chatMessagesCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
const processedMessages = new NodeCache({ stdTTL: 300, checkperiod: 60 });

const logger = pino({ level: process.env.DEBUG? 'debug' : 'silent' });
const PHONE_NUMBER = process.env.PHONE_NUMBER?.trim();
const SESSION_ID = process.env.SESSION_ID || '26_tech_v5';
const PAIRING_DELAY = 5000;

global.prefix = process.env.PREFIX || '.';

const C = {
    reset: '\x1b[0m', bold: '\x1b[1m', cyan: '\x1b[36m', green: '\x1b[32m',
    yellow: '\x1b[33m', red: '\x1b[31m', gray: '\x1b[90m', white: '\x1b[97m',
    blue: '\x1b[34m', magenta: '\x1b[35m',
};

const bannerState = {
    connection: '⏳ Starting...',
    database: '⏳ Connecting...',
    commands: '0 loaded',
    messages: 0,
    groups: 0,
    lastMsg: '—',
    ai: process.env.GROQ_API_KEY? 'Groq + Gemini' : process.env.GEMINI_API_KEY? 'Gemini' : '—',
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
    const used = ((os.totalmem() - os.freem()) / 1024 / 1024).toFixed(0);
    const total = (os.totalmem() / 1024 / 1024).toFixed(0);
    return `${used}/${total} MB`;
}

function printBanner() {
    const s = bannerState;
    const connVal = s.connection === 'ONLINE'
      ? `${C.green}${C.bold}🟢 ONLINE${C.reset}`
        : `${C.yellow}${s.connection}${C.reset}`;
    const dbVal = s.database.includes('✅')
      ? `${C.green}✅ Connected ${C.reset}`
        : `${C.yellow}${s.database}${C.reset}`;
    const lines = [
        `${C.cyan}┌─────────────────────────────────────────────┐${C.reset}`,
        `${C.cyan}│${C.reset} ${C.bold}${C.yellow}⚡ 26-𝐓𝐄𝐂𝐇${C.reset} ${C.gray}uptime: ${getUptime()}${C.reset}`,
        `${C.cyan}├─────────────────────────────────────────────┤${C.reset}`,
        `${C.cyan}│${C.reset} ${C.bold}◈ Connection ${C.reset} → ${connVal}`,
        `${C.cyan}│${C.reset} ${C.bold}🗄️ Database ${C.reset} → ${dbVal}`,
        `${C.cyan}│${C.reset} ${C.bold}⚡ Commands ${C.reset} → ${C.green}${s.commands}${C.reset}`,
        `${C.cyan}│${C.reset} ${C.bold}📨 Messages ${C.reset} → ${C.white}${s.messages}${C.reset}`,
        `${C.cyan}│${C.reset} ${C.bold}👥 Groups ${C.reset} → ${C.white}${s.groups}${C.reset}`,
        `${C.cyan}│${C.reset} ${C.bold}🤖 AI ${C.reset} → ${C.magenta}${s.ai}${C.reset}`,
        `${C.cyan}│${C.reset} ${C.bold}💾 RAM ${C.reset} → ${C.blue}${getRAM()}${C.reset}`,
        `${C.cyan}├─────────────────────────────────────────────┤${C.reset}`,
        `${C.cyan}│${C.reset} ${C.gray}Last: ${s.lastMsg}${C.reset}`,
        `${C.cyan}└─────────────────────────────────────────────┘${C.reset}`,
    ];
    lines.forEach(line => console.log(line));
    console.log('');
}

function updateBanner(key, value) {
    if (value!== null && value!== undefined && key in bannerState) {
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

global.isSockReady = () => sock?.ws && sock.ws.readyState === 1;

function resolveOwnerLid(sock) {
    let lid = sock.user?.lid || sock.authState?.creds?.me?.lid;
    if (lid) {
        const fullLid = lid.endsWith('@lid')? lid : `${lid}@lid`;
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
if (!PHONE_NUMBER ||!/^\d{10,15}$/.test(PHONE_NUMBER)) {
    log.error('PHONE_NUMBER si sahihi (mfano: 255753495142)');
    process.exit(1);
}

let sock = null;
let isConnecting = false;
let pairingRequested = false;
let bootLock = false;
let openTimer = null;
let hasEverOpened = false;
let consecutiveConflicts = 0;
const MAX_CONFLICTS = 3;

let healthCheckTimer = null;
let keepaliveTimer = null;
let cacheCleanTimer = null;
let lastEventTime = Date.now(); // FIX: track last event

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
    console.log('╚══════════════════════════╝');
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

// FIX: Health check inachunguza lastEventTime pia
function startHealthCheck() {
    if (healthCheckTimer) clearInterval(healthCheckTimer);
    healthCheckTimer = setInterval(async () => {
        const ws = sock?.ws?.readyState;
        const idleTime = Date.now() - lastEventTime;

        // Kama socket imekufa OR hakuna event kwa 10min
        if (ws === 2 || ws === 3 || idleTime > 600000) {
            log.warn(`⚠️ Health Check: Dead connection detected. WS:${ws}, Idle:${Math.floor(idleTime/1000)}s — inarestart...`);
            clearBackgroundTimers();
            isConnecting = false;
            bootLock = false;
            try { sock?.ws?.close(); } catch {}
            setTimeout(startBot, 5000);
        }
    }, 2 * 60 * 1000); // check kila 2min
}

function startKeepalive() {
    if (keepaliveTimer) clearInterval(keepaliveTimer);
    keepaliveTimer = setInterval(async () => {
        try {
            if (sock?.ws?.readyState === 1) {
                await sock.sendPresenceUpdate('available');
                lastEventTime = Date.now(); // update last event
            }
        } catch (e) {
            log.warn(`Keepalive imeshindwa: ${e.message}`);
        }
    }, 60 * 1000); // ping kila 60s, sio 90s
}

async function startBot() {
    if (bootLock || isConnecting) return;
    if (sock?.ws?.readyState === 1 && (Date.now() - lastEventTime) < 600000) return;

    bootLock = true;
    isConnecting = true;
    pairingRequested = false;
    lastEventTime = Date.now();
    clearOpenTimer();
    clearBackgroundTimers();

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
            auth: state,
            msgRetryCounterCache,
            logger,
            printQRInTerminal: false,
            browser: Browsers.ubuntu('Chrome'),
            connectTimeoutMs: 45000,
            keepAliveIntervalMs: 30000, // FIX: ping kila 30s
            generateHighQualityLinkPreview: false,
            retryRequestDelayMs: 2000,
            maxRetries: 5,
            syncFullHistory: false,
            shouldSyncHistory: () => false,
            markOnlineOnConnect: true,
            emitOwnEvents: false,
        });

        sock.ev.on('creds.update', saveCreds);
        setupContactListener(sock);

        let preKeyCount = 0;
        sock.ev.on('creds.update', () => {
            preKeyCount++;
            if (preKeyCount % 5 === 0) {
                log.info(`Pre-keys upload count: ${preKeyCount}`);
            }
        });

        // FIX: Update lastEventTime kila event
        const updateLastEvent = () => { lastEventTime = Date.now(); };
        sock.ev.on('connection.update', updateLastEvent);
        sock.ev.on('messages.upsert', updateLastEvent);
        sock.ev.on('messages.update', updateLastEvent);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection) {
                updateBanner('connection', connection === 'open'? 'ONLINE' : connection);
                log.state(`Connection → ${connection}`);
            }

            if (!pairingRequested && connection === 'connecting') {
                const isRegistered =!!(state.creds?.me || state.creds?.account);
                if (!isRegistered) {
                    pairingRequested = true;
                    log.info(`Subiri sekunde ${PAIRING_DELAY / 1000}...`);
                    setTimeout(async () => {
                        try {
                            if (state.creds?.me || state.creds?.account) return;
                            const code = await sock.requestPairingCode(PHONE_NUMBER);
                            displayPairingCode(code);
                        } catch (err) {
                            log.error(`Pairing error: ${err.message}`);
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
                consecutiveConflicts = 0;
                updateBanner('connection', 'ONLINE');

                resolveOwnerLid(sock);
                global.owner = process.env.OWNER_NUMBER || "255753495142";

                await Promise.allSettled([
                    sock.groupFetchAllParticipating().then(groups => {
                        updateBanner('groups', Object.keys(groups).length);
                    }),
                    Promise.resolve(setupAntiDelete(sock)),
                    Promise.resolve(setupAntiViewOnce(sock)),
                    Promise.resolve(setupAutoStatusViewer(sock)),
                    Promise.resolve(initGroupProtection(sock, logger)),
                ]);

                startHealthCheck();
                startKeepalive();
                startCacheCleanup();
                log.success('⚡ Health Check + Keepalive + Cache Cleanup — Zimeanzishwa');

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

                log.error(`Muunganiko Umevunjika → [${code?? '?'}]`);

                if (code === 440) {
                    consecutiveConflicts++;
                    const waitMs = consecutiveConflicts >= MAX_CONFLICTS? 60000 : 15000;
                    log.warn(`⚠️ Session conflict (${consecutiveConflicts}/${MAX_CONFLICTS}) — kusubiri ${waitMs/1000}s...`);
                    if (consecutiveConflicts >= MAX_CONFLICTS) consecutiveConflicts = 0;
                    setTimeout(startBot, waitMs);
                } else {
                    setTimeout(startBot, 7000);
                }
            }
        });

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type!== 'notify') return;
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
                const source = isGroup? 'Group' : 'DM';
                updateBanner('messages', bannerState.messages);
                updateBanner('lastMsg', `${time} · ${source} · ${text.slice(0, 25)}${text.length > 25? '...' : ''}`);
                printBanner();
            }

            const botNumber = sock.user.id.replace(/:\d+@/, '@');
            const sender = msg.key.participant || jid;
            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
            const isMentioned = text.toLowerCase().includes('26-tech') ||
                msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.includes(botNumber);

            if (isMentioned &&!msg.key.fromMe) {
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
                        await sock.sendMessage(jid, { text: txt }, { quoted: msg });
                    } catch (e) {
                        log.warn(`Send message failed: ${e.message}`);
                    }
                }
            };

            await Promise.allSettled([
                handleAntiLink(sock, msg, logger),
                handleMessage(sock, msg, extra),
            ]);
        });

        openTimer = setTimeout(() => {
            log.warn('Timeout — restarting...');
            isConnecting = false;
            bootLock = false;
            try { sock?.ws?.close(); } catch {}
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
