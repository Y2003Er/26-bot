/**
 * commands/eval.js
 * ─────────────────────────────────────────────────────────────
 * PRO GRADE EVAL v3.6 — ULTIMATE FIXED (All 7 final fixes)
 * ─────────────────────────────────────────────────────────────
 * 🔴 FIXED: railwayLogs GraphQL schema (2026), addToHistory table creation,
 *    isOwner multi-owner support, $clear DB delete, media captions,
 *    killProcess 9/15 signals, multi-statement SQL protection,
 *    ReDoS protection improved
 * 🔧 RAILWAY: Changed endpoint to backboard.railway.com + Project-Access-Token
 * 🔧 ASSETS: imagePath → ../assets/bot_image.jpg
 * 🔧 CONFIRM: 1 = confirm, 0 = cancel
 * ════════════════════════════════════════════════════════════════
 */

import { exec } from 'child_process';
import util from 'util';
import os from 'os';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/* ── polyfills ── */
let performance;
try {
    performance = globalThis.performance;
    if (!performance) throw new Error();
} catch {
    performance = (await import('perf_hooks')).performance;
}

let fetch;
try {
    fetch = globalThis.fetch;
    if (!fetch) throw new Error();
} catch {
    fetch = (await import('node-fetch')).default;
}

const execAsync = promisify(exec);
const BOT_START_TIME = new Date();

/* ──────────────── Database table creation ──────────────── */
async function ensureEvalHistoryTable() {
    if (!global.dbPool) return;
    try {
        await global.dbPool.query(`
            CREATE TABLE IF NOT EXISTS eval_history (
                id SERIAL PRIMARY KEY,
                type VARCHAR(50) NOT NULL,
                input TEXT,
                output TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
    } catch (e) {
        console.error('ensureEvalHistoryTable error:', e.message);
    }
}
// Call it once on module load
ensureEvalHistoryTable();

/* ──────────────── Owner check (fixed #3) ──────────────── */
function getOwnersList() {
    const rawKeys = [
        process.env.OWNER_NUMBER,
        process.env.OWNER_NUMBERS,
        process.env.PHONE_NUMBER,
        process.env.SUDO_USERS,
    ];
    const all = rawKeys
        .filter(Boolean)
        .flatMap(val => val.split(',').map(num => num.trim().replace(/[^0-9]/g, '')))
        .filter(num => num.length > 0)
        .map(num => num + '@s.whatsapp.net');
    return [...new Set(all)];
}

function isOwner(msg, sock) {
    if (!msg || !sock) return false;
    const isGroup = msg.key.remoteJid?.endsWith('@g.us');
    let senderJid = isGroup ? (msg.key.participant || '') : (msg.key.remoteJid || '');
    if (!senderJid) return false;
    const normalize = (jid) => {
        if (!jid) return '';
        return String(jid).split(':')[0].replace(/@lid|@s\.whatsapp\.net/g, '').replace(/[^0-9]/g, '');
    };
    const senderClean = normalize(senderJid);
    const owners = getOwnersList();
    if (owners.some(o => normalize(o) === senderClean)) return true;
    if (senderJid.endsWith('@lid') || senderJid.includes('@lid')) {
        const senderLidClean = normalize(senderJid);
        const ownerLid = (process.env.OWNER_LID || '').toString().trim();
        if (ownerLid && normalize(ownerLid) === senderLidClean) return true;
        if (sock?.user?.lid && normalize(sock.user.lid) === senderLidClean) return true;
        if (global.ownerLid && normalize(global.ownerLid) === senderLidClean) return true;
    }
    if (msg.key.fromMe === true) return true;
    if (global.evalWhitelist?.has(senderJid)) return true;
    return false;
}

/* ── History (fixed #2) ── */
const evalHistory = [];
const MAX_HISTORY = 50;
if (!global.evalExecLog) global.evalExecLog = [];

function addToHistory(type, input, output, timeMs = 0) {
    const entry = {
        type,
        input: String(input).slice(0, 200),
        output: String(output).slice(0, 200),
        timeMs,
        timestamp: new Date().toISOString()
    };
    evalHistory.unshift(entry);
    if (evalHistory.length > MAX_HISTORY) evalHistory.pop();
    if (global.dbPool) {
        global.dbPool.query(
            'INSERT INTO eval_history (type, input, output) VALUES ($1, $2, $3)',
            [type, entry.input, entry.output]
        ).catch(err => console.error('addToHistory DB error:', err.message));
    }
    global.evalExecLog.push({
        type,
        input: entry.input,
        output: entry.output,
        time: new Date().toLocaleTimeString('sw-TZ')
    });
    if (global.evalExecLog.length > 100) global.evalExecLog.shift();
}

/* ── Global state ── */
if (!global.evalWhitelist)         global.evalWhitelist         = new Set();
if (!global.evalRateLimits)        global.evalRateLimits        = new Map();
if (!global.evalRateLimitCounters) global.evalRateLimitCounters = new Map();
if (!global.evalPendingConfirm)    global.evalPendingConfirm    = new Map();
if (!global.evalCronJobs)          global.evalCronJobs          = new Map();
if (!global.evalVars)              global.evalVars              = new Map();
if (!global.evalScheduledJobs)     global.evalScheduledJobs     = new Map();
if (!global.evalReminders)         global.evalReminders         = new Map();
if (!global.evalWatchers)          global.evalWatchers          = new Map();
if (process.env.EVAL_ENCRYPT_KEY) {
    const key = Buffer.from(process.env.EVAL_ENCRYPT_KEY, 'hex');
    if (key.length === 32) {
        global.evalEncryptKey = key;
    } else {
        console.warn('⚠️ EVAL_ENCRYPT_KEY must be 32 hex bytes (64 chars). Using random key.');
        global.evalEncryptKey = crypto.randomBytes(32);
    }
} else {
    global.evalEncryptKey = global.evalEncryptKey || crypto.randomBytes(32);
}

/* ── Safe mode ── */
const BLOCKED_PATTERNS = [
    /process\s*(\.exit|\[\s*['"`]exit['"`]\s*\])\s*\(/i,
    /rm\s+-(rf|f|r)\s+[\/\~*]/i,
    /DROP\s+DATABASE/i,
    /TRUNCATE\s+TABLE/i,
    /DELETE\s+FROM\s+\w+\s*;?\s*$/i,
    /format\s+[a-z]:/i,
    /shutdown\s+-/i,
    /reboot\s*$/i,
    /mkfs\./i,
    /dd\s+if=.*of=\/dev/i,
    /chmod\s+-R\s+777\s+/i,
    />\s*\/etc\/passwd/i,
    /wget.*\|\s*bash/i,
    /curl.*\|\s*bash/i,
];
function isSafe(code) { return !BLOCKED_PATTERNS.some(p => p.test(code)); }

/* ── Utilities ── */
function truncate(str, max = 3500) {
    const s = String(str);
    return s.length > max ? s.slice(0, max) + `\n\n...[imekatwa — herufi ${s.length} jumla]` : s;
}
function formatOutput(val) {
    if (val === undefined) return 'undefined';
    if (val === null)      return 'null';
    if (typeof val === 'string') return val;
    return util.inspect(val, { depth: 4, colors: false, breakLength: 80 });
}
function formatBytes(bytes) {
    if (bytes < 1024)         return `${bytes} B`;
    if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}
function parseTimeArg(timeStr) {
    const match = timeStr.match(/^(\d+)(s|m|h|d)$/i);
    if (!match) return null;
    const val = parseInt(match[1]);
    const map = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return val * map[match[2].toLowerCase()];
}
function getContactsList() {
    const contacts = global.contactCache;
    if (!contacts || contacts.size === 0) return '📭 Cache ya contacts haina kitu kwa sasa.';
    let list = `*👥 Contacts (${contacts.size}):*\n\n`;
    let i = 1;
    for (const [jid, data] of contacts.entries()) {
        if (i > 50) { list += `\n...na ${contacts.size - 50} zaidi.`; break; }
        list += `${i}. *${data.name || data.verifiedName || 'Haina Jina'}* — ${jid.split('@')[0]}\n`;
        i++;
    }
    return list;
}
const getMainOwnerJid = () => {
    const owners = getOwnersList();
    return owners[0] || null;
};

/* ── Terminal ── */
async function runTerminal(command, cwd = process.cwd()) {
    return new Promise((resolve) => {
        exec(command, { timeout: 15000, maxBuffer: 5 * 1024 * 1024, cwd }, (error, stdout, stderr) => {
            const output = stdout || stderr || error?.message || '(hakuna output)';
            resolve({ output: output.trim(), error: !!error, code: error?.code });
        });
    });
}

/* ── JS Eval ── */
async function runEval(code, context) {
    const { sock, msg, from } = context;
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

    const buildFn = (src) => new AsyncFunction(
        'sock', 'msg', 'from', 'global', 'process', 'dynamicImport', 'vars',
        `const store = global;\n${src}`
    );

    let fn;
    try {
        fn = buildFn(`return (${code})`);
    } catch {
        fn = buildFn(code);
    }

    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('⏱️ Timeout — sekunde 15 zimepita')), 15000)
    );

    return Promise.race([
        fn(sock, msg, from, global, process, (m) => import(m), global.evalVars),
        timeout
    ]);
}

/* ── Status tracking helper ── */
async function withStatus(sock, from, msg, cmdName, actionFn) {
    const procMsg = await sock.sendMessage(from, {
        text: `⏳ *Processing:* _${cmdName}_...`
    }, { quoted: msg });
    try {
        const result = await actionFn();
        if (procMsg?.key?.id) {
            await sock.sendMessage(from, {
                delete: { remoteJid: from, fromMe: true, id: procMsg.key.id }
            }).catch(() => {});
        }
        return result;
    } catch (e) {
        if (procMsg?.key?.id) {
            await sock.sendMessage(from, {
                delete: { remoteJid: from, fromMe: true, id: procMsg.key.id }
            }).catch(() => {});
        }
        throw e;
    }
}

/* ════════════════════════════════════════════════
   CONFIRMATION SYSTEM
   ════════════════════════════════════════════════ */
function registerConfirm(from, description, action, timeoutMs = 30000) {
    const existing = global.evalPendingConfirm.get(from);
    if (existing) clearTimeout(existing.timeoutId);
    const timeoutId = setTimeout(() => global.evalPendingConfirm.delete(from), timeoutMs);
    global.evalPendingConfirm.set(from, { description, action, timeoutId });
    return `⚠️ *Thibitisho Inahitajika*\n\n*Hatua:* ${description}\n\n▸ \`.eval 1\` kuthibitisha\n▸ \`.eval 0\` kughairi\n\n_(Itatoweka baada ya sekunde 30)_`;
}

async function executeConfirm(from) {
    const pending = global.evalPendingConfirm.get(from);
    if (!pending) return '❌ Hakuna hatua inayongoja';
    clearTimeout(pending.timeoutId);
    global.evalPendingConfirm.delete(from);
    try {
        const result = await pending.action();
        return result || `✅ Hatua imetekelezwa: ${pending.description}`;
    } catch (e) {
        return `❌ Hatua imeshindwa: ${e.message}`;
    }
}

function cancelConfirm(from) {
    const pending = global.evalPendingConfirm.get(from);
    if (!pending) return '❌ Hakuna hatua inayongoja';
    clearTimeout(pending.timeoutId);
    global.evalPendingConfirm.delete(from);
    return `✅ Hatua *${pending.description}* imeghairiwa`;
}

async function executeWithConfirm(sock, from, msg, description, actionFn) {
    const confirmMsg = registerConfirm(from, description, actionFn);
    await sock.sendMessage(from, { text: confirmMsg }, { quoted: msg });
    return null;
}

/* ════════════════════════════════════════════════
   COMMANDS
   ════════════════════════════════════════════════ */

function getUptime() {
    const upSecs = process.uptime();
    const startAt = BOT_START_TIME.toLocaleString('sw-TZ', {
        weekday: 'long', year: 'numeric', month: 'long',
        day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const d = Math.floor(upSecs / 86400), h = Math.floor((upSecs % 86400) / 3600);
    const m = Math.floor((upSecs % 3600) / 60), s = Math.floor(upSecs % 60);
    return (
        `*⏱️ BOT UPTIME*\n\n🚀 *Ilianzishwa:* ${startAt}\n` +
        `*Uptime:* ${d > 0 ? `${d} siku, ` : ''}${h > 0 ? `${h} saa, ` : ''}${m > 0 ? `${m} dakika, ` : ''}${s} sekunde\n` +
        `*(${formatUptime(upSecs)} jumla)*\n*Process ID:* ${process.pid}`
    );
}

function killProcess(pid, signal = 'SIGTERM') {
    if (!pid) return '❓ Format: $kill <pid> [signal]';
    const pidNum = parseInt(pid);
    if (isNaN(pidNum)) return `❌ PID si nambari: ${pid}`;
    if ([1, process.pid].includes(pidNum)) return `🛡️ PID ${pidNum} imezuiwa`;
    const VALID = ['SIGTERM','SIGKILL','SIGINT','SIGHUP','SIGSTOP','SIGCONT','SIGUSR1','SIGUSR2','9','15'];
    let sig = signal.toUpperCase();
    if (!VALID.includes(sig)) return `❌ Signal isiyojulikana: ${sig}`;
    if (sig === '9') sig = 9;
    if (sig === '15') sig = 15;
    try { process.kill(pidNum, sig); return `✅ Signal ${sig} → PID ${pidNum}`; }
    catch (e) { return `❌ ${e.code === 'ESRCH' ? 'PID haipatikani' : e.code === 'EPERM' ? 'Ruhusa imekatazwa' : e.message}`; }
}

async function manageCron(subcommand, args, sock, from) {
    const sub = (subcommand || 'list').toLowerCase().trim();
    if (sub === 'list') {
        if (global.evalCronJobs.size === 0) return '📭 Hakuna cron jobs.';
        let out = `*⏰ CRON JOBS (${global.evalCronJobs.size}):*\n\n`;
        for (const [name, job] of global.evalCronJobs.entries()) {
            out += `• *${name}*\n  📝 ${job.description}\n  ⏱️ Kila ${job.intervalMs/1000}s\n  🕐 ${formatUptime((Date.now()-job.startedAt.getTime())/1000)} iliyopita\n\n`;
        }
        return out.trim();
    }
    if (sub === 'start') {
        const parts = (args || '').trim().split(/\s+/);
        const name = parts[0], secs = parseInt(parts[1]), desc = parts.slice(2).join(' ') || 'Hakuna maelezo';
        if (!name || isNaN(secs) || secs < 10) return '❓ $cron start <name> <secs≥10> [desc]';
        if (global.evalCronJobs.has(name)) return `❌ Cron *${name}* tayari ipo`;
        const intervalMs = secs * 1000;
        const interval = setInterval(async () => {
            try {
                const currentSock = global.sock;
                if (currentSock) {
                    await currentSock.sendMessage(from, { text: `⏰ *Cron: ${name}*\n${desc}\n_${new Date().toLocaleString('sw-TZ')}_` });
                }
            } catch {}
        }, intervalMs);
        global.evalCronJobs.set(name, { interval, description: desc, intervalMs, startedAt: new Date() });
        return `✅ Cron *${name}* imeanza! Kila sekunde ${secs}`;
    }
    if (sub === 'stop') {
        const name = (args || '').trim();
        if (!name) return '❓ $cron stop <name>';
        const job = global.evalCronJobs.get(name);
        if (!job) return `❌ Cron *${name}* haipatikani`;
        clearInterval(job.interval);
        global.evalCronJobs.delete(name);
        return `✅ Cron *${name}* imesimamishwa`;
    }
    if (sub === 'stopall') {
        const count = global.evalCronJobs.size;
        if (count === 0) return '📭 Hakuna cron jobs';
        for (const [, job] of global.evalCronJobs.entries()) clearInterval(job.interval);
        global.evalCronJobs.clear();
        return `✅ Cron jobs zote ${count} zimesimamishwa`;
    }
    return '❓ $cron list|start|stop|stopall';
}

function manageCache(target) {
    const t = (target || '').toLowerCase().trim();
    if (!t || t === 'help') {
        return `*📦 CACHE INFO*\n\nMessages: ${global.messageCache?.size||0}\nContacts: ${global.contactCache?.size||0}\nHistory: ${evalHistory.length}\n\n▸ \`$cache clear messages|contacts|history|all\``;
    }
    const action = t.replace(/^clear\s+/, '');
    if (action === 'messages') { const c = global.messageCache?.size||0; global.messageCache?.clear?.(); return `✅ Message cache imefutwa (${c})`; }
    if (action === 'contacts') { const c = global.contactCache?.size||0; global.contactCache?.clear?.(); return `✅ Contact cache imefutwa (${c})`; }
    if (action === 'history')  { const c = evalHistory.length; evalHistory.length=0; return `✅ History imefutwa (${c})`; }
    if (action === 'all') {
        const m=global.messageCache?.size||0, co=global.contactCache?.size||0, h=evalHistory.length;
        global.messageCache?.clear?.(); global.contactCache?.clear?.(); evalHistory.length=0;
        return `✅ Cache yote imefutwa\nMessages:${m} Contacts:${co} History:${h}`;
    }
    return '❓ messages|contacts|history|all';
}

async function manageBlock(sock, subcommand) {
    if ((subcommand||'list').toLowerCase() !== 'list') return '❓ $block list';
    try {
        const list = await sock.fetchBlocklist();
        if (!list?.length) return '📭 Hakuna nambari zilizobaniwa';
        return `*🚫 Blocked (${list.length}):*\n\n${list.map((j,i)=>`${i+1}. *+${j.split('@')[0]}*`).join('\n')}`;
    } catch (e) { return `❌ ${e.message}`; }
}

async function manageGroups(sock, subcommand, args) {
    const sub = (subcommand||'').toLowerCase().trim();
    const parts = (args||'').trim().split(/\s+/);
    if (sub === 'info') {
        const query = parts.join(' ').trim();
        if (!query) return '❓ $groups info <jid/jina>';
        try {
            const all = await sock.groupFetchAllParticipating();
            const group = Object.values(all).find(g => g.id===query || g.id.startsWith(query) || g.subject?.toLowerCase().includes(query.toLowerCase()));
            if (!group) return `❌ Group haikupatikana: ${query}`;
            const admins = group.participants?.filter(p=>p.admin)||[];
            return `*👥 Group Info*\n\n📛 *Jina:* ${group.subject}\n🆔 *JID:* ${group.id}\n👤 *Wanachama:* ${group.participants?.length||0}\n👑 *Admins:* ${admins.length}\n📝 *Desc:* ${group.desc||'Hakuna'}`;
        } catch (e) { return `❌ ${e.message}`; }
    }
    if (sub === 'leave') {
        const jid = parts[0]; if (!jid) return '❓ $groups leave <groupJid>';
        try { await sock.groupLeave(jid.endsWith('@g.us')?jid:`${jid}@g.us`); return '✅ Bot ametoka'; }
        catch (e) { return `❌ ${e.message}`; }
    }
    for (const sub2 of ['kick','promote','demote','add']) {
        if (sub === sub2) {
            const [gJid, mJid] = parts;
            if (!gJid||!mJid) return `❓ $groups ${sub2} <groupJid> <number>`;
            const gid  = gJid.endsWith('@g.us')?gJid:`${gJid}@g.us`;
            const mjid = mJid.includes('@')?mJid:`${mJid.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
            const actionMap = {kick:'remove',promote:'promote',demote:'demote',add:'add'};
            const msgMap    = {kick:'amefutwa',promote:'amepandishwa',demote:'ameshushwa',add:'ameongezwa'};
            try { await sock.groupParticipantsUpdate(gid,[mjid],actionMap[sub2]); return `✅ +${mjid.split('@')[0]} ${msgMap[sub2]}`; }
            catch (e) { return `❌ ${e.message}`; }
        }
    }
    return '❓ $groups info|leave|kick|promote|demote|add';
}

async function manageMsg(sock, from, subcommand, args) {
    const sub = (subcommand||'').toLowerCase().trim();
    if (sub === 'delete') {
        const parts = (args||'').trim().split(/\s+/);
        let targetJid = from, msgId = parts[0];
        if (parts.length > 1) { targetJid = parts[0].includes('@')?parts[0]:`${parts[0].replace(/[^0-9]/g,'')}@s.whatsapp.net`; msgId = parts[1]; }
        if (!msgId) return '❓ $msg delete <messageId>';
        try { await sock.sendMessage(targetJid,{delete:{remoteJid:targetJid,fromMe:true,id:msgId}}); return `✅ Ujumbe ${msgId} umefutwa`; }
        catch (e) { return `❌ ${e.message}`; }
    }
    return '❓ $msg delete <messageId>';
}

async function getProfile(sock, from, number) {
    if (!number) return '❓ $profile <number>';
    const clean = number.replace(/[^0-9]/g,''), jid = `${clean}@s.whatsapp.net`;
    try {
        let ppUrl=null, status=null, exists=false;
        try { ppUrl = await sock.profilePictureUrl(jid,'image'); } catch {}
        try { const s = await sock.fetchStatus(jid); status = s?.status||null; } catch {}
        try { const r = await sock.onWhatsApp(clean); exists = r?.[0]?.exists||false; } catch {}
        const response = `*👤 Profile: +${clean}*\n\nWhatsApp: ${exists?'✅ Ipo':'❌ Haipo'}\nStatus: ${status?`_${status}_`:'(hakuna)'}\nPicha: ${ppUrl||'(fiche au haipo)'}`;
        if (ppUrl) {
            try {
                await sock.sendMessage(from,{image:{url:ppUrl},caption:response});
                return '';
            } catch {
                return response + '\n_(imeshindwa kupakua picha)_';
            }
        }
        return response;
    } catch (e) { return `❌ ${e.message}`; }
}

async function setBotName(sock, name) {
    if (!name) return '❓ $setname <jina>';
    try { await sock.updateProfileName(name); return `✅ Jina: *${name}*`; } catch (e) { return `❌ ${e.message}`; }
}

async function setBotStatus(sock, status) {
    if (!status) return '❓ $setstatus <text>';
    try { await sock.updateProfileStatus(status); return `✅ Status: _${status}_`; } catch (e) { return `❌ ${e.message}`; }
}

function manageWhitelist(subcommand, number) {
    const sub = (subcommand||'list').toLowerCase().trim();
    if (sub === 'list') {
        if (!global.evalWhitelist.size) return '📭 Whitelist haina nambari';
        return `*✅ Whitelist (${global.evalWhitelist.size}):*\n\n${[...global.evalWhitelist].map((j,i)=>`${i+1}. *+${j.split('@')[0]}*`).join('\n')}`;
    }
    if (sub === 'add' && number) { const c=number.replace(/[^0-9]/g,''); global.evalWhitelist.add(`${c}@s.whatsapp.net`); return `✅ +${c} ameongezwa`; }
    if (sub === 'remove' && number) {
        const c=number.replace(/[^0-9]/g,''), j=`${c}@s.whatsapp.net`;
        if (!global.evalWhitelist.has(j)) return `❌ +${c} hayuko`;
        global.evalWhitelist.delete(j); return `✅ +${c} ameondolewa`;
    }
    if (sub === 'clear') { const c=global.evalWhitelist.size; global.evalWhitelist.clear(); return `✅ Whitelist imefutwa (${c})`; }
    return '❓ $whitelist list|add|remove|clear';
}

function manageRatelimit(subcommand, args) {
    const sub = (subcommand||'list').toLowerCase().trim();
    const parts = (args||'').trim().split(/\s+/);
    if (sub === 'list') {
        if (!global.evalRateLimits.size) return '📭 Hakuna rate limits';
        return `*⚡ RATE LIMITS:*\n\n${[...global.evalRateLimits.entries()].map(([cmd,cfg])=>`• *${cmd}:* ${cfg.maxCalls} calls/${cfg.windowMs/1000}s`).join('\n')}`;
    }
    if (sub === 'set') {
        const [cmd,max,secs]=parts;
        if (!cmd||!max||!secs) return '❓ $ratelimit set <cmd> <max> <secs>';
        global.evalRateLimits.set(cmd,{maxCalls:parseInt(max),windowMs:parseInt(secs)*1000});
        return `✅ Rate limit: *${cmd}* max ${max}/${secs}s`;
    }
    if (sub === 'remove') {
        const cmd=parts[0]; if (!cmd) return '❓ $ratelimit remove <cmd>';
        if (!global.evalRateLimits.has(cmd)) return `❌ ${cmd} haipatikani`;
        global.evalRateLimits.delete(cmd); return `✅ Rate limit ya ${cmd} imeondolewa`;
    }
    if (sub === 'clear') { const c=global.evalRateLimits.size; global.evalRateLimits.clear(); global.evalRateLimitCounters.clear(); return `✅ Rate limits zote ${c} zimefutwa`; }
    return '❓ $ratelimit list|set|remove|clear';
}

/* ── Database ── */
async function runDB(query) {
    let client;
    try {
        const pool = global.dbPool;
        if (!pool) return '❌ Database pool haipatikani';
        const dangerous = /;\s*(DROP|TRUNCATE|DELETE\s+FROM\s+\w+\s*(WHERE\s+1\s*=\s*1|;|$))/i;
        if (dangerous.test(query) || /;\s*$/.test(query.trim())) {
            return '🛡️ Multi-statement au destructive query imezuiwa kwa usalama';
        }
        const start = Date.now();
        client = await pool.connect();
        const result = await client.query(query);
        const time = Date.now() - start;
        if (!result.rows?.length) return `✅ Query OK (${time}ms) — rows affected: ${result.rowCount||0}`;
        const cols = Object.keys(result.rows[0]);
        const header = cols.join(' | ');
        const divider = cols.map(c=>'─'.repeat(Math.max(c.length,5))).join('─┼─');
        const rows = result.rows.slice(0,15).map(r=>cols.map(c=>String(r[c]??'NULL').slice(0,25)).join(' | ')).join('\n');
        const more = result.rows.length>15 ? `\n...na rows ${result.rows.length-15} zaidi` : '';
        return `✅ *DB* (${time}ms | rows:${result.rows.length})\n\`\`\`\n${header}\n${divider}\n${rows}${more}\n\`\`\``;
    } catch (e) {
        return `❌ DB Error:\n\`\`\`\n${e.message}\n\`\`\``;
    } finally {
        if (client) {
            try { client.release(); } catch {}
        }
    }
}

async function dbBackup(sock, from) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return '❌ DATABASE_URL haipo';
    const checkPg = await runTerminal('which pg_dump');
    if (checkPg.error) return `❌ pg_dump haipatikani\n• Tumia Railway dashboard → Database → Backups`;
    const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
    const backupFile = path.join(os.tmpdir(),`backup_${ts}.sql`);
    await sock.sendMessage(from,{text:'💾 *Inaunda DB backup...*'});
    const url = new URL(dbUrl);
    const pgHost = url.hostname;
    const pgPort = url.port || '5432';
    const pgUser = url.username;
    const pgPassword = url.password;
    const pgDatabase = url.pathname.slice(1);
    const { output, error } = await runTerminal(
        `PGPASSWORD="${pgPassword}" pg_dump -h "${pgHost}" -p "${pgPort}" -U "${pgUser}" -d "${pgDatabase}" -f "${backupFile}" 2>&1`
    );
    if (error && !fs.existsSync(backupFile)) {
        return `❌ Backup imeshindwa:\n\`\`\`\n${output}\n\`\`\``;
    }
    try {
        const stat = fs.statSync(backupFile);
        const content = fs.readFileSync(backupFile);
        const fname = `db_backup_${ts}.sql`;
        await sock.sendMessage(from, {
            document: content,
            fileName: fname,
            mimetype: 'text/plain',
            caption: `✅ *DB Backup*\n📁 File: ${fname}\n📊 Size: ${formatBytes(stat.size)}\n🕐 ${new Date().toLocaleString('sw-TZ')}`
        });
        try{ fs.unlinkSync(backupFile); } catch {}
        return '';
    } catch (e) {
        try{ fs.unlinkSync(backupFile); } catch {}
        return `❌ Imeshindwa kutuma backup: ${e.message}`;
    }
}

async function dbExtended(subcommand, query) {
    const pool = global.dbPool;
    if (!pool) return '❌ Database haipatikani';
    const sub = (subcommand||'').toLowerCase().trim();
    try {
        if (sub === 'tables') {
            const result = await pool.query(`SELECT tablename, pg_size_pretty(pg_total_relation_size(tablename::regclass)) as size FROM pg_tables WHERE schemaname='public' ORDER BY pg_total_relation_size(tablename::regclass) DESC`);
            if (!result.rows.length) return '📭 Hakuna tables';
            return `*🗄️ DB TABLES (${result.rows.length}):*\n\n${result.rows.map(r=>`• *${r.tablename}* — ${r.size}`).join('\n')}`;
        }
        if (sub === 'size') {
            const result = await pool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) as db_size, current_database() as db_name`);
            const r = result.rows[0];
            return `*💾 DB SIZE*\n\nDatabase: *${r.db_name}*\nSize: *${r.db_size}*`;
        }
        if (sub === 'explain') {
            if (!query) return '❓ $db explain <SQL>';
            let cleanQuery = query.replace(/^\s*EXPLAIN(\s+ANALYZE)?\s*/i, '').trim();
            if (/;\s*$/.test(cleanQuery) || /;\s*(DROP|TRUNCATE|DELETE)/i.test(cleanQuery)) {
                return '🛡️ Multi-statement au destructive query imezuiwa kwa usalama';
            }
            const result = await pool.query(`EXPLAIN ${cleanQuery}`);
            return `*🔍 QUERY PLAN:*\n\`\`\`\n${truncate(result.rows.map(r=>r['QUERY PLAN']).join('\n'),2500)}\n\`\`\``;
        }
        if (sub === 'connections') {
            const result = await pool.query(`SELECT COUNT(*) as total, SUM(CASE WHEN state='active' THEN 1 ELSE 0 END) as active FROM pg_stat_activity WHERE datname=current_database()`);
            const r = result.rows[0];
            return `*🔌 DB CONNECTIONS*\n\nTotal: ${r.total}\nActive: ${r.active}`;
        }
    } catch (e) { return `❌ ${e.message}`; }
    return '❓ $db tables|size|explain <SQL>|connections';
}

/* ── File management ── */
async function manageFile(sock, from, subcommand, args) {
    const sub = (subcommand||'').toLowerCase().trim();
    const parts = (args||'').trim();
    if (sub === 'ls') {
        const dir = parts||process.cwd();
        try {
            const entries = fs.readdirSync(dir,{withFileTypes:true});
            if (!entries.length) return `📭 Folder tupu: ${dir}`;
            let out=`*📂 ${dir}*\n\n`, dirs=0, files=0;
            for (const e of entries.slice(0,50)) {
                if (e.isDirectory()) { out+=`📁 ${e.name}/\n`; dirs++; }
                else { try { out+=`📄 ${e.name} _(${formatBytes(fs.statSync(path.join(dir,e.name)).size)})_\n`; } catch { out+=`📄 ${e.name}\n`; } files++; }
            }
            if (entries.length>50) out+=`\n...na ${entries.length-50} zaidi`;
            return out+`\n_Folders:${dirs} | Files:${files}_`;
        } catch (e) { return `❌ ${e.message}`; }
    }
    if (sub === 'read') {
        if (!parts) return '❓ $file read <path>';
        try {
            const resolved = path.resolve(parts);
            if (resolved.endsWith('.env')) {
                let content = fs.readFileSync(resolved, 'utf8');
                content = content.replace(/(TOKEN|SECRET|PASSWORD|DATABASE_URL|API_KEY|KEY)=(.*)/gi, '$1=********');
                return `*📄 ${path.basename(resolved)} (masked)*\n\`\`\`\n${truncate(content,3000)}\n\`\`\``;
            }
            const stat = fs.statSync(resolved);
            if (stat.size>50*1024) return `❌ File kubwa sana (${formatBytes(stat.size)}). Max: 50KB`;
            return `*📄 ${path.basename(resolved)}* (${formatBytes(stat.size)})\n\`\`\`\n${truncate(fs.readFileSync(resolved,'utf8'),3000)}\n\`\`\``;
        } catch (e) { return `❌ ${e.message}`; }
    }
    if (sub === 'write') {
        const idx=parts.indexOf(' '); if (idx===-1) return '❓ $file write <path> <content>';
        const filepath=parts.slice(0,idx).trim(), content=parts.slice(idx+1);
        try { fs.mkdirSync(path.dirname(filepath),{recursive:true}); fs.writeFileSync(filepath,content,'utf8'); return `✅ Imeandikwa: ${filepath} (${formatBytes(fs.statSync(filepath).size)})`; }
        catch (e) { return `❌ ${e.message}`; }
    }
    if (sub === 'delete') {
        if (!parts) return '❓ $file delete <path>';
        const resolved = path.resolve(parts);
        const DANGER_PREFIXES = ['/etc','/var','/usr','/bin','/sbin','/proc','/sys','/dev'];
        const isDangerous = resolved === '/'
            || resolved === path.resolve(process.cwd())
            || DANGER_PREFIXES.some(d => resolved === d || resolved.startsWith(d + path.sep));
        if (isDangerous) return '🛡️ Hauwezi kufuta folda za mfumo au bot yenyewe!';
        try {
            const stat = fs.statSync(resolved);
            if (stat.isDirectory()) {
                fs.rmSync(resolved, { recursive: true, force: true });
                return `✅ Folder imefutwa: ${resolved}`;
            }
            fs.unlinkSync(resolved);
            return `✅ File imefutwa: ${resolved}`;
        } catch (e) { return `❌ ${e.message}`; }
    }
    if (sub === 'stat') {
        if (!parts) return '❓ $file stat <path>';
        try {
            const stat=fs.statSync(parts), isDir=stat.isDirectory();
            return `*📊 ${path.basename(parts)}*\n\nAina: ${isDir?'Folder📁':'File📄'}\nUkubwa: ${formatBytes(stat.size)}\nMode: ${(stat.mode&0o777).toString(8)}\nIlipind: ${stat.mtime.toLocaleString('sw-TZ')}`;
        } catch (e) { return `❌ ${e.message}`; }
    }
    if (sub === 'send') {
        if (!parts) return '❓ $file send <path>';
        try {
            const stat=fs.statSync(parts);
            if (stat.size>50*1024*1024) return `❌ File kubwa sana. Max:50MB`;
            await sock.sendMessage(from,{document:fs.readFileSync(parts),fileName:path.basename(parts),mimetype:'application/octet-stream',caption:`📁 ${path.basename(parts)} (${formatBytes(stat.size)})`});
            return '';
        } catch (e) { return `❌ ${e.message}`; }
    }
    return '❓ $file ls|read|write|delete|stat|send';
}

async function nodeInfo(subcommand) {
    const sub = (subcommand||'info').toLowerCase().trim();
    if (sub === 'info') {
        const mem=process.memoryUsage(), cpu=process.cpuUsage();
        return `*🟢 NODE.JS*\n\nVersion: ${process.version}\nPlatform: ${process.platform} (${process.arch})\nPID: ${process.pid}\nCWD: ${process.cwd()}\n\n*Memory:*\n  Heap Used: ${formatBytes(mem.heapUsed)}\n  Heap Total: ${formatBytes(mem.heapTotal)}\n  RSS: ${formatBytes(mem.rss)}\n\n*CPU:*\n  User: ${(cpu.user/1000).toFixed(1)}ms\n  System: ${(cpu.system/1000).toFixed(1)}ms`;
    }
    if (sub === 'modules') return `*📦 NODE VERSIONS:*\n\n${Object.keys(process.versions).sort().map(m=>`• *${m}:* ${process.versions[m]}`).join('\n')}`;
    if (sub === 'argv')    return `*⌨️ ARGV:*\n\`\`\`\n${process.argv.map((a,i)=>`${i}: ${a}`).join('\n')}\n\`\`\``;
    if (sub === 'flags')   { const f=process.execArgv; return f.length?`*🏴 FLAGS:*\n${f.map(f=>`• ${f}`).join('\n')}`:'📭 Hakuna flags'; }
    if (sub === 'loaded')  { const {output}=await runTerminal('ls node_modules|head -30 2>/dev/null'); return output?.length>5?`*📦 Modules:*\n\`\`\`\n${output}\n\`\`\``:`*📦 Versions:*\n${Object.entries(process.versions).map(([k,v])=>`• ${k}: ${v}`).join('\n')}`; }
    return '❓ $node info|modules|argv|flags|loaded';
}

/* ── Bot state ── */
async function getBotState(sock, query) {
    const q = (query||'').toLowerCase().trim();
    if (!q||q==='all') {
        const groups = await Promise.race([
            sock.groupFetchAllParticipating(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
        ]).catch(err => {
            if (err.message === 'Timeout') return { _timeout: true };
            return {};
        });
        const groupCount = groups._timeout ? '⏱️ (timeout)' : Object.keys(groups || {}).length;
        const mem=process.memoryUsage(), ws=sock.ws?.readyState;
        const wsState=ws===0?'CONNECTING':ws===1?'OPEN ✅':ws===2?'CLOSING':'CLOSED ❌';
        return (
            `*📊 BOT STATE — ${new Date().toLocaleString('sw-TZ')}*\n\n` +
            `🔗 *Connection:* ${wsState}\n📱 *JID:* ${sock.user?.id||'?'}\n📛 *Name:* ${sock.user?.name||'?'}\n` +
            `👥 *Groups:* ${groupCount}\n⚡ *Commands:* ${global.allCommands?.size||0}\n⏱️ *Uptime:* ${formatUptime(process.uptime())}\n\n` +
            `*💾 MEMORY:*\n  Heap: ${formatBytes(mem.heapUsed)}/${formatBytes(mem.heapTotal)}\n  RSS: ${formatBytes(mem.rss)}\n  System: ${formatBytes(os.totalmem()-os.freemem())}/${formatBytes(os.totalmem())}\n\n` +
            `*🖥️ SYSTEM:*\n  Platform: ${process.platform}\n  Node.js: ${process.version}\n  Load: ${os.loadavg().map(l=>l.toFixed(2)).join(', ')}`
        );
    }
    if (q==='groups') {
        const groups = await Promise.race([
            sock.groupFetchAllParticipating(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
        ]).catch(() => ({}));
        return `*👥 Groups (${Object.keys(groups||{}).length}):*\n\n${Object.values(groups||{}).map(g=>`• *${g.subject}*\n  ${g.id.split('@')[0]} | ${g.participants?.length||0} wanachama`).join('\n')||'Hakuna'}`;
    }
    if (q==='commands') {
        const grouped={};
        for (const [,cmd] of (global.allCommands||new Map())) {
            const cat=cmd.type||'general'; if (!grouped[cat]) grouped[cat]=[];
            grouped[cat].push(cmd.name);
        }
        return `*⚡ Commands (${global.allCommands?.size||0}):*\n\n${Object.entries(grouped).map(([cat,cmds])=>`*${cat.toUpperCase()}:* ${cmds.join(', ')}`).join('\n')}`;
    }
    if (q==='memory'||q==='mem') {
        const mem=process.memoryUsage(), sys={total:os.totalmem(),free:os.freemem()};
        return `*💾 MEMORY*\n\nHeap Used: ${formatBytes(mem.heapUsed)}\nHeap Total: ${formatBytes(mem.heapTotal)}\nRSS: ${formatBytes(mem.rss)}\nSystem: ${formatBytes(sys.total-sys.free)}/${formatBytes(sys.total)}`;
    }
    if (q==='cache') return `*📦 CACHE*\n\nMessages: ${global.messageCache?.size||0}\nContacts: ${global.contactCache?.size||0}\nHistory: ${evalHistory.length}`;
    if (q==='env') return `*🔐 ENV KEYS:*\n\n${Object.keys(process.env).filter(k=>!['PATH','HOME','USER','SHELL','TERM','LANG','PWD'].includes(k)).sort().map(k=>`• ${k}`).join('\n')}`;
    if (q==='socket'||q==='ws') { const ws=sock.ws,state=ws?.readyState; return `*🔌 WEBSOCKET*\n\nState: ${['CONNECTING','OPEN','CLOSING','CLOSED'][state]||'UNKNOWN'} (${state})\nBuffered: ${ws?.bufferedAmount||0} bytes`; }
    if (q==='disk') { const {output}=await runTerminal('df -h /'); return `*💿 DISK*\n\n\`\`\`\n${output}\n\`\`\``; }
    if (q==='net') { const ifaces=os.networkInterfaces(); let out='*🌐 NETWORK*\n\n'; for (const [name,addrs] of Object.entries(ifaces)) { const ipv4=addrs?.find(a=>a.family==='IPv4'); if (ipv4) out+=`• *${name}:* ${ipv4.address}\n`; } return out; }
    return '❓ Chaguzi: all|groups|commands|memory|cache|env|socket|disk|net';
}

async function manageAI(subcommand, target) {
    const pool=global.dbPool; if (!pool) return '❌ Database haipatikani';
    const sub=(subcommand||'').toLowerCase().trim();
    if (sub==='clear'&&target) { const c=target.replace(/[^0-9]/g,''), jid=`${c}@s.whatsapp.net`; try { await pool.query('DELETE FROM ai_memory WHERE user_id=$1',[jid]); return `✅ AI memory ya +${c} imefutwa`; } catch(e){return `❌ ${e.message}`;} }
    if (sub==='clearall') { try { const r=await pool.query('DELETE FROM ai_memory'); return `✅ AI memory yote imefutwa (${r.rowCount})`; } catch(e){return `❌ ${e.message}`;} }
    if (sub==='list') { try { const r=await pool.query('SELECT user_id,jsonb_array_length(history) as msgs FROM ai_memory ORDER BY msgs DESC LIMIT 20'); if(!r.rows.length)return '📭 Hakuna'; return `*🧠 AI Memory:*\n\n${r.rows.map(r=>`• ${r.user_id.split('@')[0]} — ${r.msgs} msgs`).join('\n')}`; } catch(e){return `❌ ${e.message}`;} }
    if (sub==='stats') { try { const r=await pool.query('SELECT COUNT(*) as users,SUM(jsonb_array_length(history)) as total_msgs FROM ai_memory'); return `*🧠 AI Stats*\n\nUsers: ${r.rows[0].users}\nTotal msgs: ${r.rows[0].total_msgs}`; } catch(e){return `❌ ${e.message}`;} }
    return '❓ $ai list|stats|clear <num>|clearall';
}

async function manageSessions(subcommand) {
    const pool=global.dbPool; if (!pool) return '❌ Database haipatikani';
    const sub=(subcommand||'list').toLowerCase().trim();
    try {
        if (sub==='list') { const r=await pool.query('SELECT session_id,updated_at FROM wa_sessions ORDER BY updated_at DESC'); if(!r.rows.length)return '📭 Hakuna'; return `*🔐 Sessions (${r.rows.length}):*\n\n${r.rows.map(r=>`• *${r.session_id}* — ${new Date(r.updated_at).toLocaleString('sw-TZ')}`).join('\n')}`; }
        if (sub==='count') { const r=await pool.query('SELECT COUNT(*) as count FROM wa_sessions'); return `🔐 Sessions: ${r.rows[0].count}`; }
    } catch(e){return `❌ ${e.message}`;}
    return '❓ $sessions list|count';
}

function runGC() {
    const before=process.memoryUsage().heapUsed;
    if (global.gc) { global.gc(); const after=process.memoryUsage().heapUsed; return `✅ *GC Done*\n\nBefore: ${formatBytes(before)}\nAfter: ${formatBytes(after)}\nFreed: ${formatBytes(Math.max(0,before-after))}`; }
    return '⚠️ GC haipatikani — anza na: `node --expose-gc index.js`';
}

/* ── $perf ── */
async function runPerf(code, context) {
    if (!code) return '❓ $perf <js code>';
    if (!isSafe(code)) return '🛡️ Code imezuiwa kwa usalama';
    const iterations = 100;
    const totalTimeout = 10000;
    const start = performance.now();
    let i;
    try {
        for (i=0; i<iterations; i++) {
            if (performance.now() - start > totalTimeout) {
                return `⚠️ Utendaji umesimamishwa baada ya ${i} iterations (ukomo wa sekunde 10)`;
            }
            await runEval(code, context);
        }
    } catch(e) {
        return `❌ Error katika iteration ${i}: ${e.message}`;
    }
    const total = performance.now() - start;
    const avg = total / iterations;
    return `*⚡ PERFORMANCE*\n\nCode: \`${code.slice(0,60)}\`\nIterations: ${iterations}\nTotal: ${total.toFixed(2)}ms\nAvg: ${avg.toFixed(4)}ms\n${(1000/avg).toFixed(0)} ops/s`;
}

function manageEnv(action, key, value) {
    const act=(action||'').toLowerCase();
    if (act==='get') { if (!key) return '❓ $env get <KEY>'; const sens=['KEY','SECRET','PASSWORD','TOKEN','DATABASE_URL']; const val=process.env[key]; if (!val) return `❌ ${key} haipatikani`; return `🔐 *${key}:*\n${sens.some(s=>key.toUpperCase().includes(s))?'[HIDDEN]':val}`; }
    if (act==='set') { if (!key||!value) return '❓ $env set <KEY> <value>'; process.env[key]=value; return `✅ ENV ${key} imewekwa (runtime tu)`; }
    if (act==='list') return `*🔐 ENV KEYS:*\n\n${Object.keys(process.env).filter(k=>!['PATH','HOME','USER','SHELL','TERM','LANG','PWD','OLDPWD'].includes(k)).sort().map(k=>`• ${k}`).join('\n')}`;
    return '❓ $env list|get|set';
}

async function sendMessage(sock, input) {
    const parts=input.trim().split(/\s+/), target=parts[0], text=parts.slice(1).join(' ');
    if (!target||!text) return '❓ $send <number> <ujumbe>';
    const jid=target.includes('@')?target:`${target.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
    try { await sock.sendMessage(jid,{text}); return `✅ Imetumwa kwa ${jid}`; } catch(e){return `❌ ${e.message}`;}
}

async function quickBroadcast(sock, text) {
    if (!text) return '❓ $broadcast <ujumbe>';
    let groups; try { groups=await sock.groupFetchAllParticipating(); } catch(e){return `❌ ${e.message}`;}
    const ids=Object.keys(groups || {});
    if (ids.length === 0) return '❌ Hakuna groups za kutuma.';
    let sent=0,failed=0;
    for (const id of ids) { try { await new Promise(r=>setTimeout(r,1000)); await sock.sendMessage(id,{text:`📡 *26-TECH*\n\n${text}`}); sent++; } catch {failed++;} }
    return `✅ *Broadcast*\n✔️ Sent: ${sent}\n❌ Failed: ${failed}\n📊 Total: ${ids.length}`;
}

async function banNumber(sock, number, unban=false) {
    if (!number) return `❓ $${unban?'unban':'ban'} <number>`;
    const clean=number.replace(/[^0-9]/g,''), jid=`${clean}@s.whatsapp.net`;
    try { await sock.updateBlockStatus(jid,unban?'unblock':'block'); return `✅ +${clean} ${unban?'ameunblockiwa':'amebaniwa'}`; }
    catch(e){return `❌ ${e.message}`;}
}

async function pingTarget(sock, target) {
    if (!target) {
        const start=Date.now();
        try { await sock.sendPresenceUpdate('available',getMainOwnerJid()); return `🏓 *Ping*\nLatency: ${Date.now()-start}ms\nOnline ✅`; }
        catch(e){return `❌ ${e.message}`;}
    }
    const clean=target.replace(/[^0-9]/g,''), jid=target.includes('@g.us')?target:`${clean}@s.whatsapp.net`;
    const start=Date.now();
    try { const r=await sock.onWhatsApp(jid.replace('@s.whatsapp.net','')); return `📓 *Ping*\nTarget: +${clean}\nWhatsApp: ${r?.[0]?.exists?'Ipo ✅':'Haipo ❌'}\nLatency: ${Date.now()-start}ms`; }
    catch(e){return `❌ ${e.message}`;}
}

/* ── restartBot ── */
async function restartBot(sock, from) {
    await sock.sendMessage(from,{text:'🔄 *Bot inarestart...*\n_Itarudi baada ya sekunde 10._'});
    setTimeout(async()=>{
        try {
            sock.ev?.removeAllListeners?.();
            sock.ws?.close?.();
        } catch {}
        setTimeout(async()=>{
            if (typeof global.startBot==='function') {
                await global.startBot();
            } else {
                process.kill(process.pid, 'SIGTERM');
            }
        },3000);
    },2000);
    return null;
}

async function updateBot(sock, from) {
    const isRailway=!!process.env.RAILWAY_SERVICE_ID, isRender=!!process.env.RENDER_SERVICE_ID||!!process.env.RENDER;
    const hasGit=await runTerminal('git rev-parse --is-inside-work-tree').then(r=>!r.error).catch(()=>false);
    if (isRailway) {
        const token=process.env.RAILWAY_TOKEN, serviceId=process.env.RAILWAY_SERVICE_ID, envId=process.env.RAILWAY_ENVIRONMENT_ID;
        if (!token) return '❌ RAILWAY_TOKEN haipo';
        await sock.sendMessage(from,{text:'🚂 *Inatrigger Railway redeploy...*'});
        try {
            const query = `mutation Redeploy($serviceId: String!, $environmentId: String!) { serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId) }`;
            const res=await fetch('https://backboard.railway.com/graphql/v2',{
                method:'POST',
                headers:{'Content-Type':'application/json','Project-Access-Token': token},
                body:JSON.stringify({query, variables:{ serviceId, environmentId: envId }})
            });
            const data=await res.json();
            if (data.errors) return `❌ Railway Error:\n\`\`\`\n${JSON.stringify(data.errors,null,2)}\n\`\`\``;
            return '✅ *Railway Redeploy imetriggeriwa!*\nItarudi dakika 1-2';
        } catch(e){return `❌ ${e.message}`;}
    }
    if (isRender) {
        const hook=process.env.RENDER_DEPLOY_HOOK; if (!hook) return '❌ RENDER_DEPLOY_HOOK haipo';
        await sock.sendMessage(from,{text:'🎨 *Render redeploy...*'});
        try { await fetch(hook,{method:'POST'}); return '✅ Render Redeploy imetriggeriwa!'; } catch(e){return `❌ ${e.message}`;}
    }
    if (hasGit) {
        await sock.sendMessage(from,{text:'⬆️ *Inafetch updates...*'});
        const {output,error}=await runTerminal('git pull');
        if (error&&!output.includes('Already up to date')) return `❌ Git pull imeshindwa:\n\`\`\`\n${output}\n\`\`\``;
        await sock.sendMessage(from,{text:`✅ Git pull:\n\`\`\`\n${output}\n\`\`\`\n\n🔄 Inarestart...`});
        setTimeout(()=>{try{global.sock?.ws?.close();}catch{}setTimeout(()=>process.exit(0),1000);},2000);
        return null;
    }
    return '❓ Weka RAILWAY_TOKEN au RENDER_DEPLOY_HOOK';
}

/* ── railwayLogs (fixed #1 - 2026 GraphQL schema + .com + Project-Access-Token) ── */
async function railwayLogs(lines = 50) {
    if (!process.env.RAILWAY_SERVICE_ID) {
        return '⚠️ Haiko Railway environment\nTumia `$logs` kwa logs za kawaida';
    }
    const token = process.env.RAILWAY_TOKEN;
    if (!token) {
        return '❌ RAILWAY_TOKEN haipo\nWeka: `RAILWAY_TOKEN=token_yako`';
    }
    const serviceId = process.env.RAILWAY_SERVICE_ID;
    const envId = process.env.RAILWAY_ENVIRONMENT_ID;

    try {
        const deployQuery = `
            query GetDeployments($serviceId: String!, $environmentId: String!) {
                deployments(first: 1, environmentId: $environmentId) {
                    edges {
                        node {
                            id
                            status
                        }
                    }
                }
            }
        `;

        const deployRes = await fetch('https://backboard.railway.com/graphql/v2', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Project-Access-Token': token
            },
            body: JSON.stringify({
                query: deployQuery,
                variables: { serviceId, environmentId: envId }
            })
        });

        if (!deployRes.ok) {
            if (deployRes.status === 401 || deployRes.status === 403) {
                return '❌ *Not Authorized* — Project-Access-Token ni batili au imekataa ruhusa.\n🔑 Hakikisha token yako ni sahihi.';
            }
            return `❌ Railway API error: ${deployRes.status} ${deployRes.statusText}`;
        }

        const deployData = await deployRes.json();

        if (deployData.errors) {
            const firstError = deployData.errors[0];
            if (firstError.message && firstError.message.includes('Not Authorized')) {
                return '❌ *Not Authorized* — Project-Access-Token haina ruhusa.';
            }
            if (firstError.message && firstError.message.includes('rate limit')) {
                return '⏳ *Rate Limited* — Subiri dakika chache kisha jaribu tena.';
            }
            return `❌ Railway GraphQL Error:\n\`\`\`\n${firstError.message || JSON.stringify(deployData.errors, null, 2)}\n\`\`\``;
        }

        let deployment = null;
        if (deployData.data?.deployments?.edges?.length > 0) {
            deployment = deployData.data.deployments.edges[0].node;
        }

        if (!deployment) {
            return '📭 Hakuna deployment iliyopatikana.\n🔍 Hakikisha SERVICE_ID na ENVIRONMENT_ID ni sahihi.';
        }

        const logRes = await fetch(
            `https://backboard.railway.com/v2/logs?deploymentId=${deployment.id}&tail=${lines}`,
            {
                headers: { 'Project-Access-Token': token }
            }
        );

        if (!logRes.ok) {
            if (logRes.status === 401 || logRes.status === 403) {
                return '❌ *Not Authorized* — Project-Access-Token imekataa ruhusa za logs.';
            }
            return `❌ Logs API: ${logRes.status}`;
        }

        const logText = await logRes.text();
        if (!logText || logText.trim().length === 0) {
            return '📭 Hakuna log entries kwa deployment hii.';
        }

        const logs = logText
            .split('\n')
            .filter(Boolean)
            .map(line => {
                try { return JSON.parse(line).message || line; } catch { return line; }
            })
            .join('\n');

        return `*🚂 RAILWAY LOGS (${lines} lines)*\nDeployment: ${deployment.id.slice(0, 8)}...\nStatus: ${deployment.status || '?'}\n\n\`\`\`\n${truncate(logs, 2500)}\n\`\`\``;
    } catch (e) {
        return `❌ Railway logs imeshindwa: ${e.message}`;
    }
}

/* ── $logs ── */
async function getLogs(lines = 50) {
    const logLines = (global.evalExecLog || []).slice(-lines);
    if (logLines.length === 0) return '📭 Hakuna kumbukumbu za eval kwa sasa.';
    return `📜 *Kumbukumbu za Eval (${logLines.length}):*\n\n${logLines.map(entry => `[${entry.time}] ${entry.type}: ${entry.input} → ${entry.output}`).join('\n')}`;
}

function exportHistory() {
    if (!evalHistory.length) return { text: '📭 Historia haina chochote.' };
    let content = `26-TECH EVAL HISTORY\nExported: ${new Date().toLocaleString('sw-TZ')}\n${'═'.repeat(50)}\n\n`;
    evalHistory.forEach((h, i) => {
        content += `[${i + 1}] ${h.timestamp} | TYPE: ${h.type}\nINPUT: ${h.input}\nOUTPUT: ${h.output}\n${'─'.repeat(40)}\n`;
    });
    return { content, filename: `eval_history_${Date.now()}.txt` };
}

async function generateInvite(sock, groupJid) {
    if (!groupJid) return '❓ $invite <groupJid>';
    try { const jid = groupJid.includes('@g.us') ? groupJid : `${groupJid}@g.us`; const code = await sock.groupInviteCode(jid); return `🔗 *Invite Link:*\nhttps://chat.whatsapp.com/${code}`; } catch (e) { return `❌ ${e.message}`; }
}

async function viewStory(sock, target) {
    if (!target) return '❓ $story <number>';
    const clean = target.replace(/[^0-9]/g, ''), jid = `${clean}@s.whatsapp.net`;
    try { const stories = await sock.fetchStatus(jid); if (!stories || !stories.length) return '📭 Hakuna stories'; return `📖 *Stories za +${clean}:*\n\n${Array.isArray(stories) ? stories.map((s, i) => `${i + 1}. ${s.status || s}`).join('\n') : stories.status || 'Content imeonekana'}`; } catch (e) { return `❌ ${e.message}`; }
}

async function reactToMessage(sock, from, args) {
    const parts = (args || '').trim().split(/\s+/);
    if (parts.length < 2) return '❓ $react <emoji> <messageId> [jid]';
    const emoji = parts[0], msgId = parts[1], targetJid = parts[2] || from;
    try { await sock.sendMessage(targetJid, { react: { text: emoji, key: { remoteJid: targetJid, fromMe: true, id: msgId } } }); return '✅ Reaction imetumwa'; } catch (e) { return `❌ ${e.message}`; }
}

async function forwardMessage(sock, from, args) {
    const parts = (args || '').trim().split(/\s+/);
    if (parts.length < 2) return '❓ $forward <messageId> <targetJid>';
    const msgId = parts[0], target = parts[1].includes('@') ? parts[1] : `${parts[1].replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    try { await sock.sendMessage(target, { forward: { key: { remoteJid: from, id: msgId, fromMe: true } } }); return '✅ Ujumbe umepelekwa'; } catch (e) { return `❌ ${e.message}`; }
}

/* ── fullBackup ── */
async function fullBackup(sock, from) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(os.tmpdir(), `bot_backup_${ts}`);
    let archivePath = null;
    try {
        fs.mkdirSync(backupDir, { recursive: true });
        const ALLOWED_KEYS = ['NODE_ENV', 'TZ', 'PORT', 'PREFIX', 'RAILWAY_SERVICE_ID'];
        const envSafe = {};
        ALLOWED_KEYS.forEach(key => { if (process.env[key]) envSafe[key] = process.env[key]; });
        fs.writeFileSync(path.join(backupDir, 'env.json'), JSON.stringify(envSafe, null, 2));
        fs.writeFileSync(path.join(backupDir, 'history.json'), JSON.stringify(evalHistory, null, 2));
        archivePath = path.join(os.tmpdir(), `backup_${ts}.tar.gz`);
        const { error } = await runTerminal(`tar -czf "${archivePath}" -C "${os.tmpdir()}" "bot_backup_${ts}"`);
        if (!error && fs.existsSync(archivePath)) {
            const content = fs.readFileSync(archivePath);
            await sock.sendMessage(from, { document: content, fileName: `backup_${ts}.tar.gz`, mimetype: 'application/gzip', caption: `✅ Backup complete (${formatBytes(content.length)})` });
        }
        return '';
    } catch (e) {
        return `❌ Backup failed: ${e.message}`;
    } finally {
        if (fs.existsSync(backupDir)) {
            fs.rmSync(backupDir, { recursive: true, force: true });
        }
        if (archivePath && fs.existsSync(archivePath)) {
            try { fs.unlinkSync(archivePath); } catch {}
        }
    }
}

async function hotReload(sock, from, specific) {
    return '⚠️ Hotreload not supported in ES modules.\nUse `.eval $restart` to reload commands.';
}

/* ── $watch ── */
async function watchFile(filePath, action, sock, from) {
    if (!filePath || filePath === 'list') {
        if (!global.evalWatchers.size) return '📭 Hakuna file watchers';
        let out = `*👁️ WATCHERS (${global.evalWatchers.size}):*\n\n`;
        for (const [fp, w] of global.evalWatchers.entries()) out += `• \`${fp}\`\n  Mabadiliko: ${w.changes}\n  Imeanza: ${w.startedAt.toLocaleTimeString('sw-TZ')}\n\n`;
        return out.trim();
    }
    if (action === 'stop') {
        const w = global.evalWatchers.get(filePath);
        if (!w) return `❌ Watcher ya \`${filePath}\` haipatikani`;
        w.watcher.close();
        global.evalWatchers.delete(filePath);
        return `✅ Watcher imesimamishwa (mabadiliko: ${w.changes})`;
    }
    if (!fs.existsSync(filePath)) return `❌ File haipatikani: ${filePath}`;
    if (global.evalWatchers.has(filePath)) return `⚠️ Tayari inaangaliwa: \`${filePath}\``;
    let changes = 0;
    const watcher = fs.watch(filePath, async (eventType) => {
        changes++;
        try { await sock.sendMessage(from, { text: `👁️ *File Change #${changes}*\n\`${filePath}\`\nEvent: ${eventType}\n_${new Date().toLocaleTimeString('sw-TZ')}_` }); } catch {}
    });
    global.evalWatchers.set(filePath, { watcher, changes, startedAt: new Date() });
    return `✅ *Inaangalia:* \`${filePath}\`\nSimamisha: \`$watch ${filePath} stop\``;
}

/* ── $net ── */
async function testNet(url) {
    if (!url) return '❓ $net <url>\nMfano: $net https://google.com';
    const target = url.startsWith('http') ? url : `https://${url}`;
    const start = Date.now();
    let timer = null;
    try {
        const controller = new AbortController();
        timer = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(target, { method: 'HEAD', signal: controller.signal, headers: { 'User-Agent': '26-Tech-Bot/3.2' } });
        clearTimeout(timer);
        const latency = Date.now() - start;
        const emoji = res.status < 300 ? '✅' : res.status < 400 ? '↩️' : res.status < 500 ? '⚠️' : '❌';
        return `*🌐 NET TEST*\n\nURL: ${target}\nStatus: ${emoji} ${res.status} ${res.statusText}\nLatency: ${latency}ms\nServer: ${res.headers.get('server') || '?'}\nContent-Type: ${res.headers.get('content-type') || '?'}`;
    } catch (e) {
        if (timer) clearTimeout(timer);
        return `*🌐 NET TEST*\n\nURL: ${target}\n❌ Imeshindwa (${Date.now() - start}ms)\nSababu: ${e.name === 'AbortError' ? 'Timeout (>10s)' : e.message}`;
    }
}

/* ── $speed ── */
async function speedTest() {
    const testUrl = 'https://speed.cloudflare.com/__down?bytes=1000000';
    const start = Date.now();
    let downloaded = 0;
    let timer = null;
    try {
        const controller = new AbortController();
        timer = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(testUrl, { signal: controller.signal });
        clearTimeout(timer);
        const reader = res.body?.getReader();
        if (!reader) return '❌ Speed test haikuweza kuanza';
        while (true) { const { done, value } = await reader.read(); if (done) break; downloaded += value?.length || 0; }
        const seconds = (Date.now() - start) / 1000;
        const mbps = ((downloaded * 8) / seconds / 1_000_000).toFixed(2);
        const upStart = Date.now();
        await fetch('https://speed.cloudflare.com/__up', { method: 'POST', body: Buffer.alloc(100000), headers: { 'Content-Type': 'application/octet-stream' } }).catch(() => {});
        const upMbps = ((100000 * 8) / ((Date.now() - upStart) / 1000) / 1_000_000).toFixed(2);
        return `*⚡ SPEED TEST*\n\n📥 *Download:* ${mbps} Mbps\n📤 *Upload:* ${upMbps} Mbps\n🏓 *Latency:* ${Date.now() - start}ms\n📊 Downloaded: ${formatBytes(downloaded)}\n⏱️ Muda: ${seconds.toFixed(1)}s`;
    } catch (e) {
        if (timer) clearTimeout(timer);
        return `❌ Speed test imeshindwa: ${e.message}`;
    }
}

/* ── $docker ── */
async function dockerInfo(subcommand) {
    const sub = (subcommand || 'info').toLowerCase().trim();
    const isDocker = fs.existsSync('/.dockerenv') || (fs.existsSync('/proc/1/cgroup') && fs.readFileSync('/proc/1/cgroup', 'utf8').includes('docker'));
    if (sub === 'info') {
        const { output: dockerV } = await runTerminal('docker --version 2>/dev/null||echo "Docker haipatikani"');
        const { output: containers } = await runTerminal('docker ps --format "{{.Names}}: {{.Status}}" 2>/dev/null|head -10');
        return `*🐳 DOCKER INFO*\n\nEnvironment: ${isDocker ? '✅ Container' : '❌ Haipo container'}\n${dockerV}\n\n*Containers:*\n${containers || 'Hakuna'}`;
    }
    if (sub === 'ps') { const { output } = await runTerminal('docker ps --format "table {{.Names}}\\t{{.Image}}\\t{{.Status}}" 2>/dev/null'); return `*🐳 Docker Containers:*\n\`\`\`\n${output || 'Hakuna'}\n\`\`\``; }
    if (sub === 'stats') { const { output } = await runTerminal('docker stats --no-stream --format "{{.Name}}: CPU {{.CPUPerc}}, MEM {{.MemUsage}}" 2>/dev/null'); return `*🐳 Docker Stats:*\n\`\`\`\n${output || 'Hakuna'}\n\`\`\``; }
    if (sub === 'logs') { const { output } = await runTerminal('docker logs $(docker ps -q|head -1) --tail 20 2>/dev/null'); return `*🐳 Container Logs:*\n\`\`\`\n${truncate(output || 'Hakuna', 2000)}\n\`\`\``; }
    return '❓ $docker info|ps|stats|logs';
}

/* ── $memory ── */
async function memoryDump(sock, from, subcommand) {
    const sub = (subcommand || 'info').toLowerCase().trim();
    if (sub === 'info') {
        const mem = process.memoryUsage(),
            sys = { total: os.totalmem(), free: os.freemem() };
        return `*💾 MEMORY DUMP*\n\n*Heap:*\n  Used: ${formatBytes(mem.heapUsed)} (${((mem.heapUsed / mem.heapTotal) * 100).toFixed(1)}%)\n  Total: ${formatBytes(mem.heapTotal)}\n\n*Process:*\n  RSS: ${formatBytes(mem.rss)}\n  External: ${formatBytes(mem.external)}\n\n*System:*\n  Used: ${formatBytes(sys.total - sys.free)}\n  Free: ${formatBytes(sys.free)}\n  Total: ${formatBytes(sys.total)}\n\n*Globals:*\n  allCommands: ${global.allCommands?.size || 0}\n  evalHistory: ${evalHistory.length}\n  cronJobs: ${global.evalCronJobs?.size || 0}`;
    }
    if (sub === 'dump') {
        let snapFile = null;
        try {
            const { writeHeapSnapshot } = await import('v8');
            snapFile = path.join(os.tmpdir(), `heap_${Date.now()}.heapsnapshot`);
            writeHeapSnapshot(snapFile);
            const stat = fs.statSync(snapFile);
            await sock.sendMessage(from, { document: fs.readFileSync(snapFile), fileName: path.basename(snapFile), mimetype: 'application/octet-stream', caption: `💾 *Heap Snapshot*\nSize: ${formatBytes(stat.size)}\n_Open na Chrome DevTools_` });
        } catch (e) { return `❌ Heap dump imeshindwa: ${e.message}`; } finally {
            if (snapFile) { try { fs.unlinkSync(snapFile); } catch {} }
        }
        return '';
    }
    return '❓ $memory info|dump';
}

/* ── $schedule ── */
async function scheduleCode(timeStr, code, name, sock, from) {
    if (!timeStr) {
        if (!global.evalScheduledJobs.size) return '📭 Hakuna kazi zilizopangwa';
        let out = `*📅 SCHEDULED (${global.evalScheduledJobs.size}):*\n\n`;
        for (const [n, j] of global.evalScheduledJobs.entries()) out += `• *${n}*\n  Code: \`${j.code.slice(0, 40)}\`\n  Inabaki: ${formatUptime(Math.max(0, j.runsAt - Date.now()) / 1000)}\n\n`;
        return out.trim();
    }
    if (timeStr === 'cancel') {
        const job = global.evalScheduledJobs.get(code);
        if (!job) return `❌ Job *${code}* haipatikani`;
        clearTimeout(job.timeoutId);
        global.evalScheduledJobs.delete(code);
        return `✅ Job *${code}* imeghairiwa`;
    }
    const ms = parseTimeArg(timeStr);
    if (!ms) return `❌ Muda si sahihi: ${timeStr}\nMfano: 30s, 5m, 2h, 1d`;
    let jobName = name || `job_${Date.now()}`;
    let codeToRun = code;
    if (code && code.includes('--name=')) {
        const match = code.match(/--name=(\w+)/);
        if (match) {
            jobName = match[1];
            codeToRun = code.replace(/--name=\w+/, '').trim();
        }
    }
    const runsAt = Date.now() + ms;
    const timeoutId = setTimeout(async () => {
        global.evalScheduledJobs.delete(jobName);
        try {
            const result = await runEval(`return (${codeToRun})`, { sock, msg: null, from });
            await sock.sendMessage(from, { text: `⏰ *Scheduled: ${jobName}*\n\`${codeToRun.slice(0, 60)}\`\n\n✅ Result:\n\`\`\`\n${formatOutput(result)}\n\`\`\`` });
        } catch (e) {
            try { await sock.sendMessage(from, { text: `⏰ *Scheduled: ${jobName}*\n❌ Error: ${e.message}` }); } catch {}
        }
    }, ms);
    global.evalScheduledJobs.set(jobName, { timeoutId, code: codeToRun, runsAt });
    return `✅ *Imepangwa: ${jobName}*\nCode: \`${codeToRun.slice(0, 60)}\`\nBaada ya: *${timeStr}* _(${new Date(runsAt).toLocaleTimeString('sw-TZ')})_`;
}

/* ── $remind ── */
async function setReminder(timeStr, message, sock, from) {
    if (!timeStr) {
        if (!global.evalReminders.size) return '📭 Hakuna vikumbusho';
        let out = `*⏰ REMINDERS (${global.evalReminders.size}):*\n\n`;
        for (const [id, r] of global.evalReminders.entries()) out += `• *${id}*\n  📝 ${r.message}\n  ⏳ Inabaki: ${formatUptime(Math.max(0, r.runsAt - Date.now()) / 1000)}\n\n`;
        return out.trim();
    }
    if (timeStr === 'cancel') {
        const reminders = [...global.evalReminders.entries()];
        const idx = parseInt(message);
        let target;
        if (!isNaN(idx) && idx > 0 && idx <= reminders.length) {
            target = reminders[idx - 1][0];
        } else {
            target = message;
        }
        const r = global.evalReminders.get(target);
        if (!r) return `❌ Reminder haipatikani. Tumia \`$remind list\` kuona IDs.`;
        clearTimeout(r.timeoutId);
        global.evalReminders.delete(target);
        return `✅ Reminder *${target}* imeghairiwa`;
    }
    const ms = parseTimeArg(timeStr);
    if (!ms) return `❌ Muda si sahihi: ${timeStr}`;
    const id = `remind_${Date.now()}`,
        runsAt = Date.now() + ms;
    const timeoutId = setTimeout(async () => {
        global.evalReminders.delete(id);
        try { await sock.sendMessage(from, { text: `🔔 *KIKUMBUSHO*\n\n${message}\n\n_${new Date().toLocaleString('sw-TZ')}_` }); } catch {}
    }, ms);
    global.evalReminders.set(id, { timeoutId, message, runsAt });
    return `✅ *Kikumbusho:* ${message}\n⏰ Baada ya: *${timeStr}* _(${new Date(runsAt).toLocaleTimeString('sw-TZ')})_`;
}

/* ── $webhook ── */
async function sendWebhook(url, data) {
    if (!url) return '❓ $webhook <url> [json_data]';
    let payload;
    if (data) {
        try { payload = JSON.parse(data); } catch { payload = { message: data }; }
    } else {
        payload = { bot: '26-Tech-Bot', timestamp: new Date().toISOString(), pid: process.pid };
    }
    const start = Date.now();
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': '26-Tech-Bot/3.2' },
            body: JSON.stringify(payload)
        });
        const respText = await res.text().catch(() => '');
        return `*🪝 WEBHOOK*\n\nURL: ${url}\nStatus: ${res.status} ${res.statusText}\nLatency: ${Date.now() - start}ms\nResponse: ${respText.slice(0, 100) || '(empty)'}`;
    } catch (e) { return `❌ Webhook imeshindwa: ${e.message}`; }
}

/* ── $encrypt / $decrypt ── */
function encryptText(text) {
    if (!text) return '❓ $encrypt <text>';
    try {
        const iv = crypto.randomBytes(16),
            cipher = crypto.createCipheriv('aes-256-cbc', global.evalEncryptKey, iv);
        const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
        const result = `${iv.toString('hex')}:${encrypted.toString('hex')}`;
        return `*🔐 ENCRYPTED*\n\nOriginal: ${text.slice(0, 50)}\n\n\`\`\`\n${result}\n\`\`\`\n\n_Decrypt: \`$decrypt ${result}\`_`;
    } catch (e) { return `❌ ${e.message}`; }
}
function decryptText(text) {
    if (!text) return '❓ $decrypt <encrypted>';
    try {
        const parts = text.split(':');
        if (parts.length < 2) return '❌ Format si sahihi';
        const iv = Buffer.from(parts[0], 'hex'),
            encrypted = Buffer.from(parts.slice(1).join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', global.evalEncryptKey, iv);
        return `*🔓 DECRYPTED*\n\n\`\`\`\n${Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')}\n\`\`\``;
    } catch (e) { return `❌ Decryption imeshindwa: ${e.message}\n_(Key inabadilika kila restart)_`; }
}

async function generateQR(text, sock, from) {
    if (!text) return '❓ $qr <text>';
    try {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(text)}`;
        await sock.sendMessage(from, { image: { url: qrUrl }, caption: `📱 *QR Code*\n_${text.slice(0, 100)}_` });
        return '';
    } catch (e) { return `❌ QR imeshindwa: ${e.message}`; }
}

async function diffFiles(file1, file2) {
    if (!file1 || !file2) return '❓ $diff <file1> <file2>';
    if (!fs.existsSync(file1)) return `❌ File haipatikani: ${file1}`;
    if (!fs.existsSync(file2)) return `❌ File haipatikani: ${file2}`;
    try {
        const { output } = await runTerminal(`diff -u "${file1}" "${file2}" 2>&1`);
        if (!output?.trim()) return '✅ Files ni sawa — hakuna tofauti';
        return `*📝 DIFF: ${path.basename(file1)} vs ${path.basename(file2)}*\n\`\`\`\n${truncate(output, 3000)}\n\`\`\``;
    } catch (e) { return `❌ ${e.message}`; }
}

async function zipFile(filePath, outputPath) {
    if (!filePath) return '❓ $zip <file> [output.gz]';
    if (!fs.existsSync(filePath)) return `❌ File haipatikani: ${filePath}`;
    const dest = outputPath || `${filePath}.gz`;
    try {
        await new Promise((resolve, reject) => {
            const input = fs.createReadStream(filePath);
            const output = fs.createWriteStream(dest);
            const gzip = zlib.createGzip({ level: 9 });
            input.on('error', reject);
            output.on('error', reject);
            gzip.on('error', reject);
            input.pipe(gzip).pipe(output);
            output.on('finish', resolve);
        });
        const si = fs.statSync(filePath).size,
            so = fs.statSync(dest).size;
        return `✅ *Imesupwa*\n\nAsili: ${formatBytes(si)}\nOutput: ${formatBytes(so)}\nUkandamizaji: ${((1 - so / si) * 100).toFixed(1)}% pungufu`;
    } catch (e) { return `❌ ${e.message}`; }
}
async function unzipFile(filePath, outputPath) {
    if (!filePath) return '❓ $unzip <file.gz> [output]';
    if (!fs.existsSync(filePath)) return `❌ File haipatikani: ${filePath}`;
    const dest = outputPath || filePath.replace(/\.gz$/, '') || `${filePath}.out`;
    try {
        await new Promise((resolve, reject) => {
            const input = fs.createReadStream(filePath);
            const output = fs.createWriteStream(dest);
            const gunzip = zlib.createGunzip();
            input.on('error', reject);
            output.on('error', reject);
            gunzip.on('error', reject);
            input.pipe(gunzip).pipe(output);
            output.on('finish', resolve);
        });
        return `✅ *Imefunguliwa*\nOutput: ${path.basename(dest)} (${formatBytes(fs.statSync(dest).size)})`;
    } catch (e) { return `❌ ${e.message}`; }
}

function base64Tool(action, input) {
    if (!action || !input) return '❓ $base64 encode|decode <text>';
    const act = action.toLowerCase();
    try {
        if (act === 'encode') return `*🔢 BASE64 ENCODED*\n\`\`\`\n${Buffer.from(input, 'utf8').toString('base64')}\n\`\`\``;
        if (act === 'decode') return `*🔢 BASE64 DECODED*\n\`\`\`\n${Buffer.from(input, 'base64').toString('utf8')}\n\`\`\``;
        return '❓ encode|decode';
    } catch (e) { return `❌ ${e.message}`; }
}

function hashText(algorithm, text) {
    if (!text && algorithm && !['md5', 'sha1', 'sha256', 'sha512'].includes(algorithm.toLowerCase())) {
        text = algorithm;
        algorithm = null;
    }
    if (!text) return '❓ $hash [algo] <text>';
    try {
        if (algorithm) {
            const algMap = { md5: 'md5', sha1: 'sha1', sha256: 'sha256', sha512: 'sha512' };
            const realAlg = algMap[algorithm.toLowerCase()];
            if (!realAlg) return `❌ Algorithm: md5|sha1|sha256|sha512`;
            return `*#️⃣ ${realAlg.toUpperCase()}*\n\`\`\`\n${crypto.createHash(realAlg).update(text).digest('hex')}\n\`\`\``;
        }
        return `*#️⃣ HASH: "${text.slice(0, 30)}"*\n\nMD5:\n\`${crypto.createHash('md5').update(text).digest('hex')}\`\n\nSHA-256:\n\`${crypto.createHash('sha256').update(text).digest('hex')}\`\n\nSHA-512:\n\`${crypto.createHash('sha512').update(text).digest('hex').slice(0, 64)}...\``;
    } catch (e) { return `❌ ${e.message}`; }
}

/* ── $regex (ReDoS protection) ── */
function testRegex(input) {
    if (!input) return '❓ $regex <pattern> [flags] <text>\nMfano: $regex \\d+ g "hello 123 world 456"';
    let pattern, flags = '',
        text;
    const fullRegex = input.match(/^\/(.+?)\/([gimsuy]*)\s+([\s\S]+)$/);
    if (fullRegex) { [, pattern, flags, text] = fullRegex; } else {
        const parts = input.split(/\s+/);
        pattern = parts[0];
        if (parts[1] && /^[gimsuy]+$/.test(parts[1])) { flags = parts[1];
            text = parts.slice(2).join(' '); } else { text = parts.slice(1).join(' '); }
    }
    if (!text) return '❓ Lazima utoe text ya kufanyia test';
    try {
        const regex = new RegExp(pattern, flags);
        return Promise.race([
            new Promise((resolve) => {
                const start = Date.now();
                const matches = [];
                try {
                    for (const match of text.matchAll(new RegExp(pattern, flags.includes('g') ? flags : flags + 'g'))) {
                        if (Date.now() - start > 1500) {
                            resolve('🛑 Regex imezuiwa: Inachukua muda mrefu sana (Uwezekano wa ReDoS attack)!');
                            return;
                        }
                        matches.push(match);
                    }
                } catch (e) {
                    resolve(`❌ Regex error: ${e.message}`);
                    return;
                }
                let result = `*🔍 REGEX TEST*\n\nPattern: \`/${pattern}/${flags}\`\nText: "${text.slice(0, 80)}"\nMatch: ${regex.test(text) ? '✅ Imefanikiwa' : '❌ Haifanani'}`;
                if (matches.length) {
                    result += `\n\n*Matches (${matches.length}):*\n`;
                    matches.slice(0, 10).forEach((m, i) => { result += `${i + 1}. \`${m[0]}\` (index ${m.index})\n`; });
                    if (matches.length > 10) result += `...na ${matches.length - 10} zaidi`;
                }
                resolve(result);
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('ReDoS timeout')), 2000))
        ]).catch(() => '🛑 Regex imezuiwa: Inachukua muda mrefu sana (Uwezekano wa ReDoS attack)!');
    } catch (e) { return `❌ Regex si sahihi: ${e.message}`; }
}

/* ── $json ── */
function jsonTool(action, input) {
    if (!action || !input) return '❓ $json format|minify|validate <json>';
    try {
        const parsed = JSON.parse(input);
        if (action === 'format' || action === 'pretty') return `*📋 JSON FORMATTED*\n\`\`\`json\n${truncate(JSON.stringify(parsed, null, 2), 2500)}\n\`\`\``;
        if (action === 'minify') return `*📋 JSON MINIFIED*\n\`\`\`\n${truncate(JSON.stringify(parsed), 2500)}\n\`\`\``;
        if (action === 'validate') return `✅ *JSON ni halali*\nAina: ${Array.isArray(parsed) ? 'Array' : typeof parsed}\nKeys: ${Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length}`;
        return '❓ format|minify|validate';
    } catch (e) { return action === 'validate' ? `❌ *JSON si halali*\nKosa: ${e.message}` : `❌ JSON si sahihi: ${e.message}`; }
}

/* ── $csv ── */
function csvRead(filePath, rows = 20) {
    if (!filePath) return '❓ $csv read <filepath> [rows]';
    if (!fs.existsSync(filePath)) return `❌ File haipatikani: ${filePath}`;
    try {
        const text = fs.readFileSync(filePath, 'utf8').trim();
        if (!text) return '📭 CSV haina data';
        const lines = [];
        let row = [""];
        let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            const next = text[i + 1];
            if (inQuotes) {
                if (c === '"') {
                    if (next === '"') { row[row.length - 1] += '"';
                        i++; } else { inQuotes = false; }
                } else { row[row.length - 1] += c; }
            } else {
                if (c === '"') { inQuotes = true; } else if (c === ',') { row.push(""); } else if (c === '\r' || c === '\n') {
                    if (c === '\r' && next === '\n') i++;
                    lines.push(row);
                    row = [""];
                } else { row[row.length - 1] += c; }
            }
        }
        if (row.length > 1 || row[0] !== "") lines.push(row);
        if (lines.length < 2) return '📭 CSV haina data';
        const headers = lines[0].map(h => h.trim());
        const maxRows = Math.min(parseInt(rows) || 20, lines.length - 1);
        let table = `*📊 CSV: ${path.basename(filePath)}*\nRows: ${lines.length - 1} | Columns: ${headers.length}\n\nHeaders: ${headers.join(' | ')}\n${'─'.repeat(40)}\n`;
        for (let i = 1; i <= maxRows; i++) {
            const cols = lines[i];
            table += cols.map((c, j) => `${headers[j] || j}:${c.slice(0, 20)}`).join(' | ') + '\n';
        }
        if (lines.length - 1 > maxRows) table += `\n...na ${lines.length - 1 - maxRows} zaidi`;
        return `\`\`\`\n${truncate(table, 3000)}\n\`\`\``;
    } catch (e) { return `❌ ${e.message}`; }
}

/* ── $http ── */
async function httpRequest(method, url, bodyStr) {
    if (!method || !url) return '❓ *$http matumizi:*\n▸ `$http GET <url>`\n▸ `$http POST <url> <json>`\n▸ `$http PUT <url> <json>`\n▸ `$http DELETE <url>`';
    const target = url.startsWith('http') ? url : `https://${url}`;
    const reqOpts = { method: method.toUpperCase(), headers: { 'Content-Type': 'application/json', 'User-Agent': '26-Tech-Bot/3.2' } };
    if (bodyStr && ['POST', 'PUT', 'PATCH'].includes(reqOpts.method)) { try { reqOpts.body = JSON.stringify(JSON.parse(bodyStr)); } catch { reqOpts.body = bodyStr; } }
    const start = Date.now();
    let timer = null;
    try {
        const controller = new AbortController();
        timer = setTimeout(() => controller.abort(), 15000);
        reqOpts.signal = controller.signal;
        const res = await fetch(target, reqOpts);
        clearTimeout(timer);
        const latency = Date.now() - start,
            resText = await res.text();
        let resFormatted = resText;
        try { resFormatted = JSON.stringify(JSON.parse(resText), null, 2); } catch {}
        return `*🌐 HTTP ${reqOpts.method}*\n\nURL: ${target}\nStatus: ${res.status} ${res.statusText}\nLatency: ${latency}ms\n\n*Response:*\n\`\`\`\n${truncate(resFormatted, 2000)}\n\`\`\``;
    } catch (e) {
        if (timer) clearTimeout(timer);
        return `❌ HTTP ${method} imeshindwa: ${e.message}`;
    }
}

/* ── $notify ── */
async function selfNotify(sock, message) {
    if (!message) return '❓ $notify <ujumbe>';
    const ownerJid = getMainOwnerJid();
    try { await sock.sendMessage(ownerJid, { text: `🔔 *NOTIFICATION*\n\n${message}\n\n_${new Date().toLocaleString('sw-TZ')}_` }); return '✅ Notification imetumwa'; } catch (e) { return `❌ ${e.message}`; }
}

/* ── $eval all ── */
async function evalAll(code, sock, from, context) {
    if (!code) return '❓ $eval all <code>';
    let result;
    try { result = await runEval(`return (${code})`, context); } catch (e1) { try { result = await runEval(code, context); } catch (e2) { return `❌ ${e2.message}`; } }
    const output = formatOutput(result);
    const broadText = `*⚡ Eval Broadcast*\n\`${code.slice(0, 60)}\`\n\n\`\`\`\n${truncate(output, 1500)}\n\`\`\``;
    let groups;
    try { groups = await sock.groupFetchAllParticipating(); } catch (e) { return `✅ Result: ${output}\n\n❌ Groups: ${e.message}`; }
    const ids = Object.keys(groups || {});
    let sent = 0,
        failed = 0;
    for (const id of ids) { try { await new Promise(r => setTimeout(r, 800)); await sock.sendMessage(id, { text: broadText });
            sent++; } catch { failed++; } }
    return `✅ *Eval All*\nResult: \`${output.slice(0, 100)}\`\n\nGroups: ${ids.length}\n✔️ Sent: ${sent}\n❌ Failed: ${failed}`;
}

/* ════════════════════════════════════════════════
   HELP
   ════════════════════════════════════════════════ */
function getHelp() {
    return (
        '*⚡ 26-TECH PRO EVAL v3.6 FIXED*\n\n' +
        '*📝 JS Eval:*\n▸ `.eval <code>`\n▸ `.eval $perf <code>`\n▸ `.eval $eval all <code>`\n\n' +
        '*💻 Terminal:*\n▸ `.eval $ <cmd>`\n▸ `.eval $logs`\n▸ `.eval $restart`\n▸ `.eval $update`\n\n' +
        '*📊 State:*\n▸ `.eval $state [all/groups/commands/mem/cache/env/socket/disk/net]`\n▸ `.eval $uptime`\n▸ `.eval $node [info/modules/argv/flags/loaded]`\n▸ `.eval $docker [info/ps/stats/logs]`\n▸ `.eval $memory [info/dump]`\n\n' +
        '*🗄️ Database:*\n▸ `.eval $db <SQL>`\n▸ `.eval $db backup`\n▸ `.eval $db tables|size|explain <SQL>|connections`\n▸ `.eval $sessions [list/count]`\n\n' +
        '*🧠 AI:*\n▸ `.eval $ai list|stats|clear <num>|clearall`\n\n' +
        '*📡 Network:*\n▸ `.eval $ping [number]`\n▸ `.eval $net <url>`\n▸ `.eval $speed`\n▸ `.eval $http GET/POST/PUT/DELETE <url> [body]`\n▸ `.eval $webhook <url> [data]`\n▸ `.eval $send <num> <msg>`\n▸ `.eval $broadcast <msg>`\n\n' +
        '*👥 Groups:*\n▸ `.eval $groups info|leave|kick|promote|demote|add`\n▸ `.eval $invite <groupJid>`\n\n' +
        '*🧑 Profile:*\n▸ `.eval $profile <number>`\n▸ `.eval $setname|$setstatus <text>`\n▸ `.eval $story <number>`\n\n' +
        '*🔧 System:*\n▸ `.eval $ban|$unban <num>`\n▸ `.eval $block list`\n▸ `.eval $kill <pid>`\n▸ `.eval $gc`\n▸ `.eval $env list|get|set`\n\n' +
        '*🔄 Reload & Watch:*\n▸ `.eval $hotreload (disabled in ESM, use $restart)`\n▸ `.eval $watch <file>`\n▸ `.eval $watch <file> stop`\n\n' +
        '*⏰ Scheduling:*\n▸ `.eval $cron list|start|stop|stopall`\n▸ `.eval $schedule <time> <code> [name]`\n▸ `.eval $schedule cancel <name>`\n▸ `.eval $remind <time> <msg>`\n▸ `.eval $remind cancel <id>`\n\n' +
        '*🔐 Crypto:*\n▸ `.eval $encrypt <text>`\n▸ `.eval $decrypt <encrypted>`\n▸ `.eval $hash [algo] <text>`\n▸ `.eval $base64 encode|decode <text>`\n\n' +
        '*🛠️ Dev Tools:*\n▸ `.eval $regex <pattern> [flags] <text>`\n▸ `.eval $json format|minify|validate <json>`\n▸ `.eval $csv read <file>`\n▸ `.eval $diff <file1> <file2>`\n▸ `.eval $zip <file>` / `$unzip <file>`\n▸ `.eval $qr <text>`\n\n' +
        '*📁 Files:*\n▸ `.eval $file ls|read|write|delete|stat|send`\n\n' +
        '*💬 Messages:*\n▸ `.eval $msg delete <id>`\n▸ `.eval $react <emoji> <msgId>`\n▸ `.eval $forward <msgId> <target>`\n\n' +
        '*📦 Cache:*\n▸ `.eval $cache [clear all/messages/contacts/history]`\n\n' +
        '*🔔 Notifications:*\n▸ `.eval $notify <msg>`\n▸ `.eval $railway logs [lines]`\n\n' +
        '*⚡ Misc:*\n▸ `.eval $whitelist list|add|remove|clear`\n▸ `.eval $ratelimit list|set|remove|clear`\n▸ `.eval $backup`\n▸ `.eval 1` kuthibitisha / `.eval 0` kughairi\n▸ `.eval $history` / `$export` / `$clear`'
    );
}

/* ════════════════════════════════════════════════
   EXPORTS
   ════════════════════════════════════════════════ */
export const name        = 'eval';
export const description = 'Ultimate Pro Eval v3.6 FIXED — assets path + 1/0 confirm';
export const category    = 'owner';
export const use         = '<code> | $command';
export const alias       = ['ev', 'exec'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    if (!isOwner(msg, sock)) return;

    const senderJid = msg.key.participant || msg.key.remoteJid;

    const fullText = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        msg.message?.documentMessage?.caption ||
        ''
    ).trim();

    const prefix = global.prefix || '.';
    const escapedPfx = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const evalRegex = new RegExp(`^${escapedPfx}(eval|ev|exec)\\s*`, 'i');
    if (!evalRegex.test(fullText)) {
        if (!args || args.length === 0) return;
    }

    let text = fullText.replace(evalRegex, '').trim();
    if (!text && args?.length) text = args.join(' ').trim();
    if (!text) return sock.sendMessage(from, { text: '❓ Write code or use `.eval $help`' });

    const codeBlockMatch = text.match(/```(\w*)\n([\s\S]*?)```/);
    if (codeBlockMatch) text = codeBlockMatch[2].trim();

    const startTime = Date.now();
    const parts = text.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const rest = parts.slice(1).join(' ');

    // Rate-limit per command per user
    if (global.evalRateLimits.has(cmd)) {
        const limit = global.evalRateLimits.get(cmd);
        const key = `${cmd}:${senderJid}`;
        const counter = global.evalRateLimitCounters.get(key) || 0;
        if (counter >= limit.maxCalls) {
            return sock.sendMessage(from, { text: `🛑 Umefikia ukomo wa ${cmd}. Subiri kidogo.` });
        }
        global.evalRateLimitCounters.set(key, counter + 1);
        setTimeout(() => {
            const c = global.evalRateLimitCounters.get(key) || 0;
            if (c > 0) global.evalRateLimitCounters.set(key, c - 1);
        }, limit.windowMs);
    }

    const reserved = ['$state','$db','$send','$broadcast','$ban','$unban','$ping','$restart','$update',
        '$logs','$history','$export','$clear','$socket','$perf','$contacts','$gc','$env','$ai','$sessions',
        '$uptime','$kill','$cron','$cache','$block','$groups','$msg','$profile','$setname','$setstatus',
        '$whitelist','$ratelimit','$file','$node','$confirm','$cancel','$help','$reload','$backup',
        '$invite','$story','$react','$forward','$hotreload','$watch','$net','$speed','$docker','$memory',
        '$schedule','$remind','$webhook','$encrypt','$decrypt','$qr','$diff','$zip','$unzip','$base64',
        '$hash','$regex','$json','$csv','$http','$railway','$notify','$eval','$vars','1','0'];

    let result;
    try {
        switch (cmd) {
            case '$ping': result = await withStatus(sock, from, msg, 'Ping', () => pingTarget(sock, parts[1])); break;
            case '$uptime': result = await withStatus(sock, from, msg, 'Uptime', () => getUptime()); break;
            case '$state': result = await withStatus(sock, from, msg, 'State', () => getBotState(sock, parts[1])); break;
            case '$logs': result = await withStatus(sock, from, msg, 'Logs', () => getLogs(parts[1] ? parseInt(parts[1]) : 50)); break;
            case '$gc': result = await withStatus(sock, from, msg, 'GC', () => runGC()); break;
            case '$perf': result = await withStatus(sock, from, msg, 'Perf', () => runPerf(rest, { sock, msg, from })); break;
            case '$contacts': result = await withStatus(sock, from, msg, 'Contacts', () => getContactsList()); break;
            case '$socket': result = await withStatus(sock, from, msg, 'Socket', () => getBotState(sock, 'socket')); break;
            case '$node': result = await withStatus(sock, from, msg, 'Node', () => nodeInfo(parts[1])); break;
            case '$ai': result = await withStatus(sock, from, msg, 'AI', () => manageAI(parts[1], parts[2])); break;
            case '$sessions': result = await withStatus(sock, from, msg, 'Sessions', () => manageSessions(parts[1])); break;
            case '$env': result = await withStatus(sock, from, msg, 'Env', () => manageEnv(parts[1], parts[2], parts.slice(3).join(' '))); break;
            case '$cache': result = await withStatus(sock, from, msg, 'Cache', () => manageCache(parts.slice(1).join(' '))); break;
            case '$block': result = await withStatus(sock, from, msg, 'Block', () => manageBlock(sock, parts[1])); break;
            case '$kill':
                result = await executeWithConfirm(sock, from, msg, `Kill process ${parts[1]}`, async () => {
                    return await withStatus(sock, from, msg, 'Kill', () => killProcess(parts[1], parts[2]));
                });
                break;
            case '$ban': result = await withStatus(sock, from, msg, 'Ban', () => banNumber(sock, parts[1])); break;
            case '$unban': result = await withStatus(sock, from, msg, 'Unban', () => banNumber(sock, parts[1], true)); break;
            case '$send': result = await withStatus(sock, from, msg, 'Send', () => sendMessage(sock, rest)); break;
            case '$broadcast':
                result = await executeWithConfirm(sock, from, msg, 'Tuma ujumbe kwa vikundi vyote', async () => {
                    return await withStatus(sock, from, msg, 'Broadcast', () => quickBroadcast(sock, rest));
                });
                break;
            case '$groups': result = await withStatus(sock, from, msg, 'Groups', () => manageGroups(sock, parts[1], parts.slice(2).join(' '))); break;
            case '$profile': result = await withStatus(sock, from, msg, 'Profile', () => getProfile(sock, from, parts[1])); break;
            case '$setname': result = await withStatus(sock, from, msg, 'Set Name', () => setBotName(sock, rest)); break;
            case '$setstatus': result = await withStatus(sock, from, msg, 'Set Status', () => setBotStatus(sock, rest)); break;
            case '$whitelist': result = await withStatus(sock, from, msg, 'Whitelist', () => manageWhitelist(parts[1], parts[2])); break;
            case '$ratelimit': result = await withStatus(sock, from, msg, 'Ratelimit', () => manageRatelimit(parts[1], parts.slice(2).join(' '))); break;
            case '$file':
                if (parts[1] === 'delete') {
                    result = await executeWithConfirm(sock, from, msg, `Futa faili: ${parts.slice(2).join(' ')}`, async () => {
                        return await withStatus(sock, from, msg, 'File', () => manageFile(sock, from, parts[1], parts.slice(2).join(' ')));
                    });
                } else {
                    result = await withStatus(sock, from, msg, 'File', () => manageFile(sock, from, parts[1], parts.slice(2).join(' ')));
                }
                break;
            case '$msg': result = await withStatus(sock, from, msg, 'Message', () => manageMsg(sock, from, parts[1], parts.slice(2).join(' '))); break;
            case '$react': result = await withStatus(sock, from, msg, 'React', () => reactToMessage(sock, from, rest)); break;
            case '$forward': result = await withStatus(sock, from, msg, 'Forward', () => forwardMessage(sock, from, rest)); break;
            case '$invite': result = await withStatus(sock, from, msg, 'Invite', () => generateInvite(sock, parts[1])); break;
            case '$story': result = await withStatus(sock, from, msg, 'Story', () => viewStory(sock, parts[1])); break;
            case '$backup':
                result = await executeWithConfirm(sock, from, msg, 'Backup kamili ya bot', async () => {
                    return await withStatus(sock, from, msg, 'Backup', () => fullBackup(sock, from));
                });
                break;

            // ── CONFIRMATION: 1 = confirm, 0 = cancel ──
            case '$confirm':
            case '1':
                result = await withStatus(sock, from, msg, 'Confirm', () => executeConfirm(from)); break;

            case '$cancel':
            case '0':
                result = await withStatus(sock, from, msg, 'Cancel', () => cancelConfirm(from)); break;

            case '$cron': result = await withStatus(sock, from, msg, 'Cron', () => manageCron(parts[1], parts.slice(2).join(' '), sock, from)); break;
            case '$reload': result = await withStatus(sock, from, msg, 'Reload', () => '⚠️ ESM reload limited. Use $restart.'); break;

            case '$db':
                if (parts[1] === 'backup') {
                    result = await executeWithConfirm(sock, from, msg, 'Backup hifadhidata', async () => {
                        return await withStatus(sock, from, msg, 'DB Backup', () => dbBackup(sock, from));
                    });
                } else if (['tables', 'size', 'explain', 'connections'].includes(parts[1])) {
                    result = await withStatus(sock, from, msg, 'DB', () => dbExtended(parts[1], parts.slice(2).join(' ')));
                } else {
                    result = await withStatus(sock, from, msg, 'DB Query', () => { if (!rest) return '❓ $db <SQL>'; return runDB(rest); });
                }
                break;

            case '$history':
                result = await withStatus(sock, from, msg, 'History', () => {
                    if (!evalHistory.length) return '📭 Historia haina chochote';
                    return evalHistory.map((h, i) => `${i + 1}. [${h.type}] ${h.input.slice(0, 60)}`).join('\n');
                });
                break;
            case '$export':
                result = await withStatus(sock, from, msg, 'Export', async () => {
                    const exp = exportHistory();
                    if (exp.text) return exp.text;
                    await sock.sendMessage(from, { document: Buffer.from(exp.content, 'utf8'), fileName: exp.filename, mimetype: 'text/plain', caption: '📤 History exported' });
                    return '📤 History exported';
                });
                break;
            case '$clear':
                result = await withStatus(sock, from, msg, 'Clear', async () => {
                    const c = evalHistory.length;
                    evalHistory.length = 0;
                    if (global.dbPool) {
                        try {
                            await global.dbPool.query('DELETE FROM eval_history');
                        } catch (e) {
                            console.error('Clear DB error:', e.message);
                        }
                    }
                    global.evalExecLog = [];
                    return `✅ Cleared ${c} entries from memory and database.`;
                });
                break;

            case '$restart':
                result = await executeWithConfirm(sock, from, msg, 'Anzisha upya bot', async () => {
                    return await withStatus(sock, from, msg, 'Restart', async () => {
                        await restartBot(sock, from);
                        return '🔄 Bot inaanza upya...';
                    });
                });
                break;

            case '$update':
                result = await executeWithConfirm(sock, from, msg, 'Sasisha bot kutoka GitHub', async () => {
                    return await withStatus(sock, from, msg, 'Update', async () => {
                        const updateRes = await updateBot(sock, from);
                        return updateRes || '✅ Update imeanzishwa';
                    });
                });
                break;

            case '$hotreload':
                result = await withStatus(sock, from, msg, 'Hotreload', () => hotReload(sock, from, parts[1] || null));
                break;

            case '$watch':
                if (parts[2] === 'stop') {
                    result = await withStatus(sock, from, msg, 'Watch Stop', () => watchFile(parts[1], 'stop', sock, from));
                } else if (parts[1] === 'stop') {
                    return sock.sendMessage(from, { text: '❓ Usage: $watch <file> stop' }, { quoted: msg });
                } else {
                    result = await withStatus(sock, from, msg, 'Watch', () => watchFile(parts[1] || 'list', null, sock, from));
                }
                break;

            case '$net':
                result = await withStatus(sock, from, msg, 'Net Test', () => testNet(parts[1]));
                break;
            case '$speed':
                result = await withStatus(sock, from, msg, 'Speed', () => speedTest());
                break;
            case '$docker':
                result = await withStatus(sock, from, msg, 'Docker', () => dockerInfo(parts[1]));
                break;
            case '$memory':
                result = await withStatus(sock, from, msg, 'Memory', () => memoryDump(sock, from, parts[1]));
                break;

            case '$schedule':
                if (parts[1] === 'cancel') {
                    if (!parts[2]) return sock.sendMessage(from, { text: '❓ $schedule cancel <name>' }, { quoted: msg });
                    result = await withStatus(sock, from, msg, 'Schedule Cancel', () => scheduleCode('cancel', parts.slice(2).join(' '), null, sock, from));
                } else if (!parts[1] || parts[1] === 'list') {
                    result = await withStatus(sock, from, msg, 'Schedule List', () => scheduleCode(null, null, null, sock, from));
                } else {
                    let nameArg = null;
                    let codeArg = parts.slice(2).join(' ');
                    if (parts[2] && !parts[2].startsWith('--')) {
                        nameArg = parts[2];
                        codeArg = parts.slice(3).join(' ');
                    }
                    result = await withStatus(sock, from, msg, 'Schedule', () => scheduleCode(parts[1], codeArg, nameArg, sock, from));
                }
                break;

            case '$remind':
                if (parts[1] === 'cancel') {
                    if (!parts[2]) return sock.sendMessage(from, { text: '❓ $remind cancel <id>' }, { quoted: msg });
                    result = await withStatus(sock, from, msg, 'Remind Cancel', () => setReminder('cancel', parts.slice(2).join(' '), sock, from));
                } else if (!parts[1] || parts[1] === 'list') {
                    result = await withStatus(sock, from, msg, 'Remind List', () => setReminder(null, null, sock, from));
                } else {
                    result = await withStatus(sock, from, msg, 'Remind', () => setReminder(parts[1], parts.slice(2).join(' '), sock, from));
                }
                break;

            case '$webhook':
                result = await withStatus(sock, from, msg, 'Webhook', () => sendWebhook(parts[1], parts.slice(2).join(' ') || null));
                break;
            case '$encrypt':
                result = await withStatus(sock, from, msg, 'Encrypt', () => encryptText(rest));
                break;
            case '$decrypt':
                result = await withStatus(sock, from, msg, 'Decrypt', () => decryptText(rest));
                break;
            case '$qr':
                result = await withStatus(sock, from, msg, 'QR', () => generateQR(rest, sock, from));
                break;
            case '$diff':
                result = await withStatus(sock, from, msg, 'Diff', () => diffFiles(parts[1], parts[2]));
                break;
            case '$zip':
                result = await withStatus(sock, from, msg, 'Zip', () => zipFile(parts[1], parts[2]));
                break;
            case '$unzip':
                result = await withStatus(sock, from, msg, 'Unzip', () => unzipFile(parts[1], parts[2]));
                break;
            case '$base64':
                result = await withStatus(sock, from, msg, 'Base64', () => base64Tool(parts[1], parts.slice(2).join(' ')));
                break;
            case '$hash':
                result = await withStatus(sock, from, msg, 'Hash', () => {
                    const knownAlgos = ['md5', 'sha1', 'sha256', 'sha512'];
                    if (parts[1] && knownAlgos.includes(parts[1].toLowerCase())) return hashText(parts[1], parts.slice(2).join(' '));
                    return hashText(null, rest);
                });
                break;
            case '$regex':
                result = await withStatus(sock, from, msg, 'Regex', () => testRegex(rest));
                break;
            case '$json':
                result = await withStatus(sock, from, msg, 'JSON', () => jsonTool(parts[1], parts.slice(2).join(' ')));
                break;
            case '$csv':
                result = await withStatus(sock, from, msg, 'CSV', () => { if (parts[1] === 'read') return csvRead(parts[2], parts[3]); return '❓ $csv read <file> [rows]'; });
                break;
            case '$http':
                result = await withStatus(sock, from, msg, 'HTTP', () => httpRequest(parts[1], parts[2], parts.slice(3).join(' ') || null));
                break;

            case '$railway':
                if (parts[1] === 'logs') {
                    result = await withStatus(sock, from, msg, 'Railway Logs', () => railwayLogs(parts[2] ? parseInt(parts[2]) : 50));
                } else {
                    result = '❓ $railway logs [lines]';
                }
                break;

            case '$notify':
                result = await withStatus(sock, from, msg, 'Notify', () => selfNotify(sock, rest));
                break;

            case '$eval':
                if (parts[1] === 'all') {
                    result = await executeWithConfirm(sock, from, msg, 'Tuma eval kwa vikundi VYOTE', async () => {
                        return await withStatus(sock, from, msg, 'Eval All', () => evalAll(parts.slice(2).join(' '), sock, from, { sock, msg, from }));
                    });
                } else {
                    result = '❓ $eval all <code>';
                }
                break;

            case '$vars':
                if (parts[1] === 'list') {
                    result = [...global.evalVars.keys()].join(', ') || 'Hakuna vigezo.';
                } else if (parts[1] === 'get' && parts[2]) {
                    result = global.evalVars.get(parts[2]) || 'Haijawakilishwa.';
                } else if (parts[1] === 'set' && parts[2]) {
                    global.evalVars.set(parts[2], parts.slice(3).join(' '));
                    result = `✅ Vigezo \`${parts[2]}\` vimewekwa.`;
                } else if (parts[1] === 'clear') {
                    global.evalVars.clear();
                    result = '✅ Vigezo vyote vimefutwa.';
                } else {
                    result = '❓ $vars list|get|set|clear';
                }
                break;

            case '$help': {
                const helpText = getHelp();
                const procMsg = await sock.sendMessage(from, { text: '⏳ *Processing:* _Help_...' }, { quoted: msg });
                try {
                    // ── FIXED: assets folder path ──
                    const imagePath = path.join(__dirname, '../assets/bot_image.jpg');
                    if (fs.existsSync(imagePath)) {
                        await sock.sendMessage(from, { image: fs.readFileSync(imagePath), caption: helpText, mentions: [msg.key.participant || msg.key.remoteJid] }, { quoted: msg });
                    } else {
                        await sock.sendMessage(from, { text: helpText }, { quoted: msg });
                    }
                } catch (e) { await sock.sendMessage(from, { text: helpText }, { quoted: msg }); }
                if (procMsg?.key?.id) { await sock.sendMessage(from, { delete: { remoteJid: from, fromMe: true, id: procMsg.key.id } }).catch(() => {}); }
                return;
            }

            default:
                if (text.startsWith('$') && !reserved.some(r => cmd === r)) {
                    const terminalCmd = text.slice(1).trim();
                    if (!terminalCmd) {
                        return sock.sendMessage(from, { text: '❓ $ <terminal command>' }, { quoted: msg });
                    }
                    if (!isSafe(terminalCmd)) {
                        return sock.sendMessage(from, { text: '❌ Amri hii imezuiwa kwa usalama.' });
                    }
                    result = await withStatus(sock, from, msg, 'Terminal', async () => {
                        const { output, error } = await runTerminal(terminalCmd);
                        const time = Date.now() - startTime;
                        addToHistory('terminal', text, output, time);
                        return `✅ *Terminal* (${time}ms)\n\`\`\`\n${truncate(output)}\n\`\`\``;
                    });
                    break;
                }

                if (!isSafe(text)) return sock.sendMessage(from, { text: '❌ Code imezuiwa kwa usalama' });
                result = await withStatus(sock, from, msg, 'JS Eval', async () => {
                    const output = await runEval(text, { sock, msg, from });
                    const time = Date.now() - startTime;
                    const finalResult = `✅ *Eval* (${time}ms)\n\`\`\`\n${truncate(formatOutput(output))}\n\`\`\``;
                    addToHistory('eval', text, finalResult, time);
                    return finalResult;
                });
                break;
        }

        if (result !== null && result !== undefined && result !== '') {
            if (typeof result === 'string') {
                await sock.sendMessage(from, { text: result }, { quoted: msg });
            } else {
                await sock.sendMessage(from, {
                    text: `✅ *Command completed*\n\`\`\`\n${truncate(formatOutput(result), 1500)}\n\`\`\``
                }, { quoted: msg });
            }
        }

    } catch (e) {
        console.error('Eval execute error:', e);
        await sock.sendMessage(from, {
            text: `❌ *Error:*\n\`\`\`\n${truncate(e.stack || e.message, 1500)}\n\`\`\``
        }, { quoted: msg });
    }
}
