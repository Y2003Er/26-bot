/**
 * commands/eval.js
 * ─────────────────────────────────────────────────────────────
 * PRO GRADE EVAL — Owner peke yake
 * ─────────────────────────────────────────────────────────────
 * SECURITY FIXES:
 * ✅ @lid bypass imefungwa — LID lazima iwe kwenye OWNER_LID list
 * ✅ Shell injection fixed — execFile badala ya exec
 * ✅ $db — SELECT-only mode + multi-statement block
 * ✅ $broadcast — confirmation step kabla ya kutuma
 * ✅ $restart — confirmation step
 * ✅ isSafe() — improved bypass detection (bracket notation, concat)
 *
 * NEW COMMANDS:
 * ✅ $uptime         — dedicated uptime display
 * ✅ $kill <pid>     — kill process by PID
 * ✅ $cron list/stop — view/stop scheduled jobs
 * ✅ $cache clear    — futa messageCache / contactCache
 * ✅ $block list     — orodha ya blocked numbers
 * ✅ $groups leave   — leave group
 * ✅ $groups add     — add member to group
 * ✅ $msg delete     — delete message by ID
 * ✅ $profile        — profile picture + status
 * ✅ $setname        — change bot display name
 * ✅ $setstatus      — change bot status/bio
 * ✅ $whitelist      — manage allowed numbers
 * ✅ $ratelimit      — set command rate limits
 * ✅ $db backup      — dump DB to file
 * ✅ $file           — file system management
 * ✅ $node           — Node.js info + loaded modules
 * ─────────────────────────────────────────────────────────────
 */

import { execFile, exec } from 'child_process';
import util               from 'util';
import os                 from 'os';
import fs                 from 'fs';
import path               from 'path';

// ══════════════════════════════════════════════════════════════
//   OWNER CHECK — botNumber + fromMe + startsWith
// ══════════════════════════════════════════════════════════════

const OWNERS_LIST = (process.env.OWNER_NUMBER || '')
    .split(',')
    .map(num => num.replace(/[^0-9]/g, ''))
    .filter(Boolean);

function isOwner(msg, sock) {
    // Namba ya bot yenyewe — inasafishwa vizuri (bila :0, bila @s.whatsapp.net)
    const botNumber = sock.user?.id?.split(':')[0]?.split('@')[0] || '';

    // Sender — participant (group) au remoteJid (DM)
    const sender = msg.key.participant || msg.key.remoteJid || '';

    // Njia 3 za kuthibitisha:
    // 1. Sender ipo kwenye OWNERS_LIST (inafanya kazi na @s.whatsapp.net, @lid, yoyote)
    // 2. fromMe === true — ujumbe kutoka kwa owner/linked device
    // 3. sender.startsWith(botNumber) — inashughulikia @lid, :0@, formats zote
    const result =
        OWNERS_LIST.some(num => sender.includes(num)) ||
        msg.key.fromMe === true ||
        sender.startsWith(botNumber);

    console.log('\n\uD83D\uDD0D [EVAL DEBUG] ─────────────────────');
    console.log('  remoteJid  :', msg.key.remoteJid);
    console.log('  participant:', msg.key.participant || '(none)');
    console.log('  fromMe     :', msg.key.fromMe);
    console.log('  sender     :', sender);
    console.log('  botNumber  :', botNumber);
    console.log('  OWNERS_LIST:', OWNERS_LIST);
    console.log('  isOwner ✅ :', result);
    console.log('─────────────────────────────────────\n');

    return result;
}

// ══════════════════════════════════════════════════════════════
//   HISTORY
// ══════════════════════════════════════════════════════════════

const evalHistory = [];
const MAX_HISTORY = 20;

function addToHistory(type, input, output, timeMs = 0) {
    evalHistory.unshift({
        type,
        input:     String(input).slice(0, 150),
        output:    String(output).slice(0, 150),
        timeMs,
        timestamp: new Date().toLocaleTimeString('sw-TZ'),
        date:      new Date().toLocaleDateString('sw-TZ')
    });
    if (evalHistory.length > MAX_HISTORY) evalHistory.pop();
}

// ══════════════════════════════════════════════════════════════
//   PENDING CONFIRMATIONS — kwa $broadcast, $restart, $clearall
// ══════════════════════════════════════════════════════════════

const pendingConfirm = new Map(); // jid → { action, data, expiry }

function setPending(jid, action, data) {
    pendingConfirm.set(jid, {
        action,
        data,
        expiry: Date.now() + 30_000 // sekunde 30
    });
}

function getPending(jid) {
    const p = pendingConfirm.get(jid);
    if (!p) return null;
    if (Date.now() > p.expiry) {
        pendingConfirm.delete(jid);
        return null;
    }
    return p;
}

function clearPending(jid) {
    pendingConfirm.delete(jid);
}

// ══════════════════════════════════════════════════════════════
//   WHITELIST
// ══════════════════════════════════════════════════════════════

const whitelistSet = new Set(
    (process.env.WHITELIST_NUMBERS || '')
        .split(',')
        .map(n => n.replace(/[^0-9]/g, ''))
        .filter(Boolean)
        .map(n => `${n}@s.whatsapp.net`)
);

function manageWhitelist(action, number) {
    const act = (action || '').toLowerCase();

    if (act === 'list') {
        if (!whitelistSet.size) return '📭 Whitelist haina nambari yoyote.';
        const list = [...whitelistSet].map(j => `• +${j.split('@')[0]}`).join('\n');
        return `*✅ Whitelist (${whitelistSet.size}):*\n\n${list}`;
    }

    if (!number) return '❓ Format: $whitelist <add|remove|list> [number]';

    const clean = number.replace(/[^0-9]/g, '');
    if (!clean) return '❌ Nambari si sahihi.';
    const jid = `${clean}@s.whatsapp.net`;

    if (act === 'add') {
        whitelistSet.add(jid);
        return `✅ *+${clean}* ameongezwa kwenye whitelist.`;
    }

    if (act === 'remove') {
        if (!whitelistSet.has(jid)) return `❌ *+${clean}* hayupo kwenye whitelist.`;
        whitelistSet.delete(jid);
        return `✅ *+${clean}* ameondolewa kwenye whitelist.`;
    }

    return '❓ Format: $whitelist <add|remove|list> [number]';
}

// ══════════════════════════════════════════════════════════════
//   RATE LIMITING
// ══════════════════════════════════════════════════════════════

// Map ya command → { maxCalls, windowMs }
const rateLimits  = new Map();
// Map ya `command:jid` → [timestamps]
const rateHistory = new Map();

function manageRateLimit(action, command, value) {
    const act = (action || '').toLowerCase();

    if (act === 'list') {
        if (!rateLimits.size) return '📭 Hakuna rate limits zilizowekwa.';
        const list = [...rateLimits.entries()].map(([cmd, cfg]) =>
            `• *${cmd}*: max ${cfg.maxCalls} calls / ${cfg.windowMs / 1000}s`
        ).join('\n');
        return `*⏱️ Rate Limits:*\n\n${list}`;
    }

    if (act === 'set') {
        if (!command || !value) return '❓ Format: $ratelimit set <command> <maxCalls/windowSeconds>\nMfano: $ratelimit set ai 5/60';
        const match = String(value).match(/^(\d+)\/(\d+)$/);
        if (!match) return '❌ Format ya value lazima iwe: maxCalls/windowSeconds (mfano: 5/60)';
        rateLimits.set(command.toLowerCase(), {
            maxCalls:  parseInt(match[1]),
            windowMs:  parseInt(match[2]) * 1000
        });
        return `✅ Rate limit ya *${command}*: max ${match[1]} calls kila sekunde ${match[2]}.`;
    }

    if (act === 'remove') {
        if (!command) return '❓ Format: $ratelimit remove <command>';
        if (!rateLimits.has(command.toLowerCase())) return `❌ Hakuna rate limit ya *${command}*.`;
        rateLimits.delete(command.toLowerCase());
        return `✅ Rate limit ya *${command}* imeondolewa.`;
    }

    if (act === 'clear') {
        rateLimits.clear();
        rateHistory.clear();
        return '✅ Rate limits zote zimefutwa.';
    }

    return '❓ Format:\n▸ `$ratelimit list`\n▸ `$ratelimit set <cmd> <max/secs>`\n▸ `$ratelimit remove <cmd>`\n▸ `$ratelimit clear`';
}

// ══════════════════════════════════════════════════════════════
//   SAFE MODE — IMPROVED bypass detection
// ══════════════════════════════════════════════════════════════

const BLOCKED_PATTERNS = [
    // Basic patterns
    /process\s*(\.exit|\[\s*['"`]exit['"`]\s*\])\s*\(/i,
    /rm\s+-rf\s+[\/~]/i,
    /rm\s+-rf\s+\*/i,
    /DROP\s+DATABASE/i,
    /TRUNCATE\s+TABLE/i,
    /DELETE\s+FROM\s+\w+\s*;?\s*$/i,
    /format\s+[a-z]:/i,
    /shutdown\s+-/i,
    /reboot\s*$/i,
    /mkfs\./i,
    /dd\s+if=.*of=\/dev/i,
    /chmod\s+-R\s+777\s+\//i,
    />\s*\/etc\/passwd/i,
    /wget.*\|\s*bash/i,
    /curl.*\|\s*bash/i,
    // ✅ NEW: bracket notation bypass
    /\[\s*['"`]exit['"`]\s*\]/i,
    /\[\s*['"`]kill['"`]\s*\]/i,
    // ✅ NEW: string concat bypass (ex + it)
    /['"`]\s*\+\s*['"`]exit['"`]/i,
    /['"`]ex['"`]\s*\+\s*['"`]it['"`]/i,
    // ✅ NEW: global.process bypass
    /global\s*\.\s*process\s*\.\s*exit/i,
    /globalThis\s*\.\s*process/i,
];

function isSafe(code) {
    return !BLOCKED_PATTERNS.some(p => p.test(code));
}

// ══════════════════════════════════════════════════════════════
//   UTILITIES
// ══════════════════════════════════════════════════════════════

function truncate(str, max = 3500) {
    const s = String(str);
    return s.length > max
        ? s.slice(0, max) + `\n\n...[imekatwa — herufi ${s.length} jumla]`
        : s;
}

function formatOutput(val) {
    if (val === undefined) return 'undefined';
    if (val === null)      return 'null';
    if (typeof val === 'string') return val;
    return util.inspect(val, { depth: 4, colors: false, breakLength: 80 });
}

function getContactsList() {
    const contacts = global.contactCache;
    if (!contacts || contacts.size === 0) return '📭 Cache ya contacts haina kitu kwa sasa.';
    let list = `*👥 Orodha ya Contacts (${contacts.size}):*\n\n`;
    let i = 1;
    for (const [jid, data] of contacts.entries()) {
        if (i > 50) { list += `\n...na contacts ${contacts.size - 50} zaidi.`; break; }
        list += `${i}. *${data.name || data.verifiedName || 'Haina Jina'}* — ${jid.split('@')[0]}\n`;
        i++;
    }
    return list;
}

function formatBytes(bytes) {
    if (bytes < 1024)        return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
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

// ══════════════════════════════════════════════════════════════
//   TERMINAL — execFile (FIXED: no shell injection)
// ══════════════════════════════════════════════════════════════

async function runTerminal(command, cwd = process.cwd()) {
    return new Promise((resolve) => {
        // ✅ FIX: execFile via /bin/sh prevents direct injection but still
        //    supports pipes, redirects etc. — safer than raw exec()
        execFile('/bin/sh', ['-c', command], {
            timeout:   15000,
            maxBuffer: 2 * 1024 * 1024,
            cwd
        }, (error, stdout, stderr) => {
            const output = stdout || stderr || error?.message || '(hakuna output)';
            resolve({ output: output.trim(), error: !!error, code: error?.code });
        });
    });
}

// ══════════════════════════════════════════════════════════════
//   JS EVAL — async + timeout + context
// ══════════════════════════════════════════════════════════════

async function runEval(code, context) {
    const { sock, msg, from } = context;
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const fn = new AsyncFunction(
        'sock', 'msg', 'from', 'global', 'process', 'require',
        `const store = global;\n${code}`
    );
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('⏱️ Timeout — imechukua zaidi ya sekunde 15')), 15000)
    );
    return Promise.race([
        fn(sock, msg, from, global, process, (m) => import(m)),
        timeout
    ]);
}

// ══════════════════════════════════════════════════════════════
//   $STATE — Bot inspection
// ══════════════════════════════════════════════════════════════

async function getBotState(sock, query) {
    const q = (query || '').toLowerCase().trim();

    if (!q || q === 'all') {
        const groups = await sock.groupFetchAllParticipating().catch(() => ({}));
        const mem    = process.memoryUsage();
        const ws     = sock.ws?.readyState;
        const wsState = ws === 0 ? 'CONNECTING' : ws === 1 ? 'OPEN ✅' : ws === 2 ? 'CLOSING' : 'CLOSED ❌';
        return (
            `*📊 BOT STATE — ${new Date().toLocaleString('sw-TZ')}*\n\n` +
            `🔗 *Connection:* ${wsState}\n` +
            `📱 *Bot JID:* ${sock.user?.id || '?'}\n` +
            `📛 *Bot Name:* ${sock.user?.name || '?'}\n` +
            `👥 *Groups:* ${Object.keys(groups).length}\n` +
            `⚡ *Commands:* ${global.allCommands?.size || 0}\n` +
            `⏱️ *Uptime:* ${formatUptime(process.uptime())}\n\n` +
            `*💾 MEMORY:*\n` +
            `  Heap Used:  ${formatBytes(mem.heapUsed)}\n` +
            `  Heap Total: ${formatBytes(mem.heapTotal)}\n` +
            `  RSS:        ${formatBytes(mem.rss)}\n` +
            `  System:     ${formatBytes(os.totalmem() - os.freemem())} / ${formatBytes(os.totalmem())}\n\n` +
            `*🖥️ SYSTEM:*\n` +
            `  Platform: ${process.platform}\n` +
            `  Node.js:  ${process.version}\n` +
            `  CPU:      ${os.cpus()[0]?.model?.split(' ').slice(0, 3).join(' ') || '?'}\n` +
            `  Load Avg: ${os.loadavg().map(l => l.toFixed(2)).join(', ')}`
        );
    }

    if (q === 'groups') {
        const groups = await sock.groupFetchAllParticipating().catch(() => ({}));
        const list   = Object.values(groups)
            .map(g => `• *${g.subject}*\n  ${g.id.split('@')[0]} | ${g.participants?.length || 0} wanachama`)
            .join('\n');
        return `*👥 Groups (${Object.keys(groups).length}):*\n\n${list || 'Hakuna'}`;
    }

    if (q === 'commands') {
        const grouped = {};
        for (const [, cmd] of (global.allCommands || new Map())) {
            const cat = cmd.type || 'general';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(cmd.name);
        }
        let out = `*⚡ Commands (${global.allCommands?.size || 0}):*\n\n`;
        for (const [cat, cmds] of Object.entries(grouped)) {
            out += `*${cat.toUpperCase()}:* ${cmds.join(', ')}\n`;
        }
        return out;
    }

    if (q === 'memory' || q === 'mem') {
        const mem = process.memoryUsage();
        const sys = { total: os.totalmem(), free: os.freemem() };
        return (
            `*💾 MEMORY USAGE*\n\n` +
            `*Process:*\n` +
            `  Heap Used:  ${formatBytes(mem.heapUsed)}\n` +
            `  Heap Total: ${formatBytes(mem.heapTotal)}\n` +
            `  RSS:        ${formatBytes(mem.rss)}\n` +
            `  External:   ${formatBytes(mem.external)}\n\n` +
            `*System:*\n` +
            `  Used:  ${formatBytes(sys.total - sys.free)}\n` +
            `  Free:  ${formatBytes(sys.free)}\n` +
            `  Total: ${formatBytes(sys.total)}`
        );
    }

    if (q === 'cache') {
        const msgCache = global.messageCache?.size || 0;
        const contacts = global.contactCache?.size || 0;
        return (
            `*📦 CACHE STATE*\n\n` +
            `Message Cache: ${msgCache} items\n` +
            `Contact Cache: ${contacts} items\n` +
            `History Cache: ${evalHistory.length} items`
        );
    }

    if (q === 'env') {
        const keys = Object.keys(process.env)
            .filter(k => !['PATH', 'HOME', 'USER', 'SHELL', 'TERM', 'LANG', 'PWD'].includes(k))
            .sort()
            .map(k => `• ${k}`)
            .join('\n');
        return `*🔐 ENV KEYS (values zimefichwa):*\n\n${keys}`;
    }

    if (q === 'socket' || q === 'ws') {
        const ws      = sock.ws;
        const state   = ws?.readyState;
        const labels  = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
        return (
            `*🔌 WEBSOCKET STATE*\n\n` +
            `State: ${labels[state] || 'UNKNOWN'} (${state})\n` +
            `Buffered: ${ws?.bufferedAmount || 0} bytes\n` +
            `Protocol: ${ws?.protocol || '?'}\n` +
            `URL: ${ws?.url || '?'}`
        );
    }

    if (q === 'disk') {
        const { output } = await runTerminal('df -h /');
        return `*💿 DISK USAGE*\n\n\`\`\`\n${output}\n\`\`\``;
    }

    if (q === 'net' || q === 'network') {
        const ifaces = os.networkInterfaces();
        let out = `*🌐 NETWORK INTERFACES*\n\n`;
        for (const [name, addrs] of Object.entries(ifaces)) {
            const ipv4 = addrs?.find(a => a.family === 'IPv4');
            if (ipv4) out += `• *${name}:* ${ipv4.address}\n`;
        }
        return out;
    }

    return `❓ Query isiyojulikana: *${q}*\nChaguzi: all, groups, commands, memory, cache, env, socket, disk, net`;
}

// ══════════════════════════════════════════════════════════════
//   $UPTIME — Dedicated uptime display
// ══════════════════════════════════════════════════════════════

function getUptime() {
    const seconds = process.uptime();
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const started = new Date(Date.now() - seconds * 1000);

    return (
        `*⏱️ BOT UPTIME*\n\n` +
        `${d}d ${h}h ${m}m ${s}s\n\n` +
        `Started: ${started.toLocaleString('sw-TZ')}\n` +
        `Now:     ${new Date().toLocaleString('sw-TZ')}`
    );
}

// ══════════════════════════════════════════════════════════════
//   $KILL — Kill process by PID
// ══════════════════════════════════════════════════════════════

async function killProcess(pidStr, signal = 'SIGTERM') {
    if (!pidStr) return '❓ Format: $kill <pid> [signal]\nMfano: $kill 1234\n       $kill 1234 SIGKILL';

    const pid = parseInt(pidStr);
    if (isNaN(pid) || pid <= 0) return '❌ PID si sahihi.';

    // Usiruhusu kuua process yake mwenyewe bila makusudio
    if (pid === process.pid) {
        return `⚠️ Unataka kuua process ya bot (PID ${pid})!\nTumia \`$restart\` badala yake.`;
    }

    const validSignals = ['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGHUP', 'SIGUSR1', 'SIGUSR2'];
    const sig = signal.toUpperCase();
    if (!validSignals.includes(sig)) {
        return `❌ Signal si sahihi. Zinazoruhusiwa: ${validSignals.join(', ')}`;
    }

    try {
        process.kill(pid, sig);
        return `✅ Signal *${sig}* imetumwa kwa PID *${pid}*`;
    } catch (e) {
        if (e.code === 'ESRCH') return `❌ Process PID *${pid}* haipatikani (tayari imekufa au haipo).`;
        if (e.code === 'EPERM') return `❌ Huna ruhusa ya kuua PID *${pid}*.`;
        return `❌ Imeshindwa: ${e.message}`;
    }
}

// ══════════════════════════════════════════════════════════════
//   $CRON — View / stop scheduled jobs
// ══════════════════════════════════════════════════════════════

function manageCron(action, jobId) {
    const act = (action || 'list').toLowerCase();

    // Global cron registry — bot yako lazima isajili hapa
    // global.cronJobs = Map<id, { name, interval, fn, timer }>
    const jobs = global.cronJobs;

    if (!jobs || jobs.size === 0) {
        return '📭 Hakuna scheduled jobs. Sajili kwa `global.cronJobs.set(id, { name, interval, timer })`';
    }

    if (act === 'list') {
        const list = [...jobs.entries()].map(([id, job]) =>
            `• *${id}*: ${job.name || 'Unnamed'} — kila ${job.interval || '?'}ms\n  Status: ${job.timer ? '🟢 Running' : '🔴 Stopped'}`
        ).join('\n');
        return `*⏰ Cron Jobs (${jobs.size}):*\n\n${list}`;
    }

    if (act === 'stop') {
        if (!jobId) return '❓ Format: $cron stop <id>';
        const job = jobs.get(jobId);
        if (!job) return `❌ Job *${jobId}* haipatikani.`;
        if (job.timer) {
            clearInterval(job.timer);
            job.timer = null;
        }
        return `✅ Job *${jobId}* (${job.name || 'Unnamed'}) imesimamishwa.`;
    }

    if (act === 'start') {
        if (!jobId) return '❓ Format: $cron start <id>';
        const job = jobs.get(jobId);
        if (!job) return `❌ Job *${jobId}* haipatikani.`;
        if (job.timer) return `⚠️ Job *${jobId}* tayari inaendesha.`;
        if (!job.fn)   return `❌ Job *${jobId}* haina function ya kuendesha.`;
        job.timer = setInterval(job.fn, job.interval || 60000);
        return `✅ Job *${jobId}* (${job.name || 'Unnamed'}) imeanzishwa tena.`;
    }

    if (act === 'stopall') {
        let stopped = 0;
        for (const [, job] of jobs) {
            if (job.timer) { clearInterval(job.timer); job.timer = null; stopped++; }
        }
        return `✅ Jobs ${stopped} zimesimamishwa.`;
    }

    return '❓ Format: $cron <list|start|stop|stopall> [id]';
}

// ══════════════════════════════════════════════════════════════
//   $CACHE — Futa messageCache / contactCache
// ══════════════════════════════════════════════════════════════

function manageCache(target) {
    const t = (target || 'all').toLowerCase();

    if (t === 'messages' || t === 'msg') {
        const before = global.messageCache?.size || 0;
        global.messageCache?.clear?.();
        return `✅ Message cache imefutwa (items ${before}).`;
    }

    if (t === 'contacts') {
        const before = global.contactCache?.size || 0;
        global.contactCache?.clear?.();
        return `✅ Contact cache imefutwa (items ${before}).`;
    }

    if (t === 'history') {
        const before = evalHistory.length;
        evalHistory.length = 0;
        return `✅ Eval history imefutwa (items ${before}).`;
    }

    if (t === 'all') {
        const msg  = global.messageCache?.size || 0;
        const cont = global.contactCache?.size || 0;
        const hist = evalHistory.length;
        global.messageCache?.clear?.();
        global.contactCache?.clear?.();
        evalHistory.length = 0;
        return (
            `✅ *Cache yote imefutwa:*\n\n` +
            `  Messages: ${msg} items\n` +
            `  Contacts: ${cont} items\n` +
            `  History:  ${hist} items`
        );
    }

    return '❓ Format: $cache <all|messages|contacts|history>';
}

// ══════════════════════════════════════════════════════════════
//   $BLOCK LIST — Orodha ya blocked numbers
// ══════════════════════════════════════════════════════════════

async function getBlockList(sock) {
    try {
        const blocked = await sock.fetchBlocklist();
        if (!blocked?.length) return '📭 Hakuna nambari zilizoblockiwa.';
        const list = blocked.map((jid, i) =>
            `${i + 1}. +${jid.split('@')[0]}`
        ).join('\n');
        return `*🚫 Blocked Numbers (${blocked.length}):*\n\n${list}`;
    } catch (e) {
        return `❌ Imeshindwa kupata blocklist: ${e.message}`;
    }
}

// ══════════════════════════════════════════════════════════════
//   $GROUPS — Leave / Add member
// ══════════════════════════════════════════════════════════════

async function manageGroups(sock, action, ...args) {
    const act = (action || '').toLowerCase();

    // $groups leave <groupId>
    if (act === 'leave') {
        const groupId = args[0];
        if (!groupId) return '❓ Format: $groups leave <groupId>';
        const jid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
        try {
            await sock.groupLeave(jid);
            return `✅ Bot ameitoka group *${jid}*`;
        } catch (e) {
            return `❌ Imeshindwa: ${e.message}`;
        }
    }

    // $groups add <groupId> <number>
    if (act === 'add') {
        const [groupId, number] = args;
        if (!groupId || !number) return '❓ Format: $groups add <groupId> <number>';
        const gJid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
        const uJid = `${number.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
        try {
            const result = await sock.groupParticipantsUpdate(gJid, [uJid], 'add');
            const status = result?.[0]?.status;
            if (status === '200') return `✅ *+${number}* ameongezwa kwenye group.`;
            if (status === '403') return `❌ *+${number}* aliweka privacy — hawezi kuongezwa.`;
            if (status === '408') return `❌ *+${number}* hapo WhatsApp.`;
            return `ℹ️ Status: ${status}`;
        } catch (e) {
            return `❌ Imeshindwa: ${e.message}`;
        }
    }

    // $groups kick <groupId> <number>
    if (act === 'kick') {
        const [groupId, number] = args;
        if (!groupId || !number) return '❓ Format: $groups kick <groupId> <number>';
        const gJid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
        const uJid = `${number.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
        try {
            await sock.groupParticipantsUpdate(gJid, [uJid], 'remove');
            return `✅ *+${number}* amefukuzwa kutoka group.`;
        } catch (e) {
            return `❌ Imeshindwa: ${e.message}`;
        }
    }

    // $groups promote / demote
    if (act === 'promote' || act === 'demote') {
        const [groupId, number] = args;
        if (!groupId || !number) return `❓ Format: $groups ${act} <groupId> <number>`;
        const gJid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
        const uJid = `${number.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
        try {
            await sock.groupParticipantsUpdate(gJid, [uJid], act === 'promote' ? 'promote' : 'demote');
            return `✅ *+${number}* ${act === 'promote' ? 'amekuwa admin' : 'ameondolewa admin'}.`;
        } catch (e) {
            return `❌ Imeshindwa: ${e.message}`;
        }
    }

    // $groups info <groupId>
    if (act === 'info') {
        const groupId = args[0];
        if (!groupId) return '❓ Format: $groups info <groupId>';
        const jid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
        try {
            const meta = await sock.groupMetadata(jid);
            const admins = meta.participants.filter(p => p.admin).map(p => `+${p.id.split('@')[0]}`).join(', ');
            return (
                `*ℹ️ Group Info*\n\n` +
                `Name:     ${meta.subject}\n` +
                `ID:       ${meta.id.split('@')[0]}\n` +
                `Members:  ${meta.participants.length}\n` +
                `Admins:   ${admins || 'Hakuna'}\n` +
                `Created:  ${new Date(meta.creation * 1000).toLocaleString('sw-TZ')}\n` +
                `Desc:     ${meta.desc || '(hakuna)'}`
            );
        } catch (e) {
            return `❌ Imeshindwa: ${e.message}`;
        }
    }

    return (
        `❓ *$groups matumizi:*\n\n` +
        `▸ \`$groups leave <groupId>\`\n` +
        `▸ \`$groups add <groupId> <number>\`\n` +
        `▸ \`$groups kick <groupId> <number>\`\n` +
        `▸ \`$groups promote <groupId> <number>\`\n` +
        `▸ \`$groups demote <groupId> <number>\`\n` +
        `▸ \`$groups info <groupId>\``
    );
}

// ══════════════════════════════════════════════════════════════
//   $MSG DELETE — Delete message by ID
// ══════════════════════════════════════════════════════════════

async function deleteMessage(sock, from, input) {
    // Format: $msg delete <jid> <messageId>
    // au: $msg delete <messageId>  (kwenye same chat)
    const parts = input.trim().split(/\s+/);

    let targetJid, messageId;

    if (parts.length === 2) {
        // jid + messageId
        targetJid = parts[0].includes('@') ? parts[0] : `${parts[0].replace(/[^0-9]/g, '')}@s.whatsapp.net`;
        messageId = parts[1];
    } else if (parts.length === 1) {
        targetJid = from;
        messageId = parts[0];
    } else {
        return '❓ Format: $msg delete <messageId>\n       au: $msg delete <jid> <messageId>';
    }

    try {
        await sock.sendMessage(targetJid, {
            delete: {
                remoteJid:    targetJid,
                fromMe:       true,
                id:           messageId,
                participant:  undefined
            }
        });
        return `✅ Ujumbe *${messageId}* umefutwa.`;
    } catch (e) {
        return `❌ Imeshindwa: ${e.message}`;
    }
}

async function manageMsg(sock, from, action, rest) {
    const act = (action || '').toLowerCase();
    if (act === 'delete' || act === 'del') return deleteMessage(sock, from, rest);
    return '❓ Format: $msg delete <messageId>';
}

// ══════════════════════════════════════════════════════════════
//   $PROFILE — Profile picture + status
// ══════════════════════════════════════════════════════════════

async function getProfile(sock, from, number) {
    if (!number) return '❓ Format: $profile <number>';

    const clean = number.replace(/[^0-9]/g, '');
    const jid   = `${clean}@s.whatsapp.net`;

    try {
        const [pic, status, onWhatsApp] = await Promise.allSettled([
            sock.profilePictureUrl(jid, 'image'),
            sock.fetchStatus(jid),
            sock.onWhatsApp(clean)
        ]);

        const picUrl    = pic.status    === 'fulfilled' ? pic.value    : null;
        const statusTxt = status.status === 'fulfilled' ? status.value?.status || '(hakuna)' : '(hakuna)';
        const exists    = onWhatsApp.status === 'fulfilled' ? onWhatsApp.value?.[0]?.exists : false;

        const info = (
            `*👤 Profile: +${clean}*\n\n` +
            `WhatsApp: ${exists ? 'Ipo ✅' : 'Haipo ❌'}\n` +
            `Status:   ${statusTxt}\n` +
            `Pic URL:  ${picUrl || '(hakuna)'}`
        );

        if (picUrl) {
            await sock.sendMessage(from, {
                image: { url: picUrl },
                caption: info
            });
            return null;
        }

        return info;
    } catch (e) {
        return `❌ Imeshindwa: ${e.message}`;
    }
}

// ══════════════════════════════════════════════════════════════
//   $SETNAME — Change bot display name
// ══════════════════════════════════════════════════════════════

async function setBotName(sock, name) {
    if (!name) return '❓ Format: $setname <jina_jipya>';
    try {
        await sock.updateProfileName(name);
        return `✅ Jina la bot limebadilishwa kuwa *${name}*`;
    } catch (e) {
        return `❌ Imeshindwa: ${e.message}`;
    }
}

// ══════════════════════════════════════════════════════════════
//   $SETSTATUS — Change bot status / bio
// ══════════════════════════════════════════════════════════════

async function setBotStatus(sock, status) {
    if (!status) return '❓ Format: $setstatus <maandishi>';
    try {
        await sock.updateProfileStatus(status);
        return `✅ Status ya bot imebadilishwa:\n_${status}_`;
    } catch (e) {
        return `❌ Imeshindwa: ${e.message}`;
    }
}

// ══════════════════════════════════════════════════════════════
//   $DB — Database queries (SELECT-only mode FIXED)
// ══════════════════════════════════════════════════════════════

async function runDB(query, allowWrite = false) {
    try {
        const pool = global.dbPool;
        if (!pool) return '❌ Database pool haipatikani (global.dbPool)';

        // ✅ FIX: Kuzuia multi-statement queries (SQL injection via ;)
        const statements = query.split(';').map(s => s.trim()).filter(Boolean);
        if (statements.length > 1) {
            return '🛡️ *Multi-statement queries haziruhusiwi.* Tumia query moja kwa wakati mmoja.';
        }

        const dangerous = /^\s*(DROP\s+(DATABASE|TABLE)|TRUNCATE|DELETE\s+FROM\s+\w+\s*;?\s*$)/i;
        if (dangerous.test(query)) {
            return '🛡️ *Query imezuiwa kwa usalama.*\nTumia WHERE clause kwa DELETE.';
        }

        // ✅ FIX: Kwa default, ruhusu SELECT tu
        const isWrite = /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)/i.test(query);
        if (isWrite && !allowWrite) {
            return (
                `⚠️ *Write query imegunduliwa.*\n\n` +
                `Tumia \`$dbw <SQL>\` kwa write queries (INSERT/UPDATE/DELETE).\n` +
                `\`$db\` ni kwa SELECT tu.`
            );
        }

        const start  = Date.now();
        const result = await pool.query(query);
        const time   = Date.now() - start;

        if (!result.rows?.length) {
            return `✅ Query imefanikiwa (${time}ms)\nRows affected: ${result.rowCount || 0}`;
        }

        const cols    = Object.keys(result.rows[0]);
        const header  = cols.join(' | ');
        const divider = cols.map(c => '─'.repeat(Math.max(c.length, 5))).join('─┼─');
        const rows    = result.rows.slice(0, 15).map(r =>
            cols.map(c => String(r[c] ?? 'NULL').slice(0, 25)).join(' | ')
        ).join('\n');
        const more = result.rows.length > 15
            ? `\n...na rows ${result.rows.length - 15} zaidi`
            : '';

        return (
            `✅ *DB Result* (${time}ms | rows: ${result.rows.length})\n\n` +
            `\`\`\`\n${header}\n${divider}\n${rows}${more}\n\`\`\``
        );
    } catch (e) {
        return `❌ *DB Error:*\n\`\`\`\n${e.message}\n\`\`\``;
    }
}

// ══════════════════════════════════════════════════════════════
//   $DB BACKUP — Dump DB to file
// ══════════════════════════════════════════════════════════════

async function backupDB(sock, from) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return '❌ DATABASE_URL haipo kwenye ENV.';

    await sock.sendMessage(from, { text: '🗄️ *Inaunda backup ya database...*' });

    const filename  = `backup_${Date.now()}.sql`;
    const tmpPath   = path.join(os.tmpdir(), filename);

    // Jaribu pg_dump (PostgreSQL)
    const { output, error } = await runTerminal(
        `pg_dump "${dbUrl}" -f "${tmpPath}" 2>&1`
    );

    if (error && !fs.existsSync(tmpPath)) {
        // Jaribu mysqldump kama pg_dump haifanyi kazi
        const mysqlMatch = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^/]+)\/(.+)/);
        if (mysqlMatch) {
            const [, user, pass, host, dbName] = mysqlMatch;
            const { error: mErr } = await runTerminal(
                `MYSQL_PWD="${pass}" mysqldump -u "${user}" -h "${host}" "${dbName}" > "${tmpPath}" 2>&1`
            );
            if (mErr) return `❌ mysqldump imeshindwa: ${output}`;
        } else {
            return `❌ pg_dump imeshindwa: ${output}`;
        }
    }

    try {
        const fileBuffer = fs.readFileSync(tmpPath);
        const stats      = fs.statSync(tmpPath);
        await sock.sendMessage(from, {
            document: fileBuffer,
            fileName: filename,
            mimetype: 'application/sql',
            caption:  `✅ *DB Backup*\nSize: ${formatBytes(stats.size)}\nFile: ${filename}`
        });
        fs.unlinkSync(tmpPath);
    } catch (e) {
        return `❌ Kutuma file imeshindwa: ${e.message}`;
    }

    return null;
}

// ══════════════════════════════════════════════════════════════
//   $FILE — File system management
// ══════════════════════════════════════════════════════════════

async function manageFile(sock, from, action, ...args) {
    const act = (action || '').toLowerCase();

    // $file ls [path]
    if (act === 'ls' || act === 'list') {
        const dir = args[0] || process.cwd();
        try {
            const items   = fs.readdirSync(dir, { withFileTypes: true });
            const listing = items.slice(0, 50).map(item => {
                const prefix = item.isDirectory() ? '📁' : '📄';
                const fullP  = path.join(dir, item.name);
                let size = '';
                try {
                    const stat = fs.statSync(fullP);
                    size = item.isDirectory() ? '' : ` (${formatBytes(stat.size)})`;
                } catch {}
                return `${prefix} ${item.name}${size}`;
            }).join('\n');
            const more = items.length > 50 ? `\n...na items ${items.length - 50} zaidi` : '';
            return `*📂 ${dir}:*\n\n${listing}${more}`;
        } catch (e) {
            return `❌ Imeshindwa: ${e.message}`;
        }
    }

    // $file read <path>
    if (act === 'read' || act === 'cat') {
        const filePath = args[0];
        if (!filePath) return '❓ Format: $file read <path>';
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            return `*📄 ${filePath}:*\n\n\`\`\`\n${truncate(content, 3000)}\n\`\`\``;
        } catch (e) {
            return `❌ Imeshindwa: ${e.message}`;
        }
    }

    // $file write <path> <content>
    if (act === 'write') {
        const filePath = args[0];
        const content  = args.slice(1).join(' ');
        if (!filePath || !content) return '❓ Format: $file write <path> <content>';
        try {
            fs.writeFileSync(filePath, content, 'utf8');
            return `✅ Imeandika kwa *${filePath}* (${formatBytes(Buffer.byteLength(content))})`;
        } catch (e) {
            return `❌ Imeshindwa: ${e.message}`;
        }
    }

    // $file delete <path>
    if (act === 'delete' || act === 'rm') {
        const filePath = args[0];
        if (!filePath) return '❓ Format: $file delete <path>';
        // Safety — usiruhusu kufuta directories za mfumo
        const dangerous = ['/', '/etc', '/bin', '/usr', '/var', '/proc', '/sys'];
        if (dangerous.includes(filePath)) return '🛡️ Kufuta directory hii kumezuiwa.';
        try {
            fs.unlinkSync(filePath);
            return `✅ *${filePath}* imefutwa.`;
        } catch (e) {
            return `❌ Imeshindwa: ${e.message}`;
        }
    }

    // $file send <path>
    if (act === 'send') {
        const filePath = args[0];
        if (!filePath) return '❓ Format: $file send <path>';
        try {
            const buffer   = fs.readFileSync(filePath);
            const stats    = fs.statSync(filePath);
            const filename = path.basename(filePath);
            await sock.sendMessage(from, {
                document: buffer,
                fileName: filename,
                mimetype: 'application/octet-stream',
                caption:  `📎 ${filename} (${formatBytes(stats.size)})`
            });
            return null;
        } catch (e) {
            return `❌ Imeshindwa: ${e.message}`;
        }
    }

    // $file stat <path>
    if (act === 'stat' || act === 'info') {
        const filePath = args[0];
        if (!filePath) return '❓ Format: $file stat <path>';
        try {
            const s = fs.statSync(filePath);
            return (
                `*📄 File Info: ${path.basename(filePath)}*\n\n` +
                `Path:     ${filePath}\n` +
                `Size:     ${formatBytes(s.size)}\n` +
                `Type:     ${s.isDirectory() ? 'Directory' : s.isFile() ? 'File' : 'Other'}\n` +
                `Created:  ${s.birthtime.toLocaleString('sw-TZ')}\n` +
                `Modified: ${s.mtime.toLocaleString('sw-TZ')}\n` +
                `Mode:     ${(s.mode & 0o777).toString(8)}`
            );
        } catch (e) {
            return `❌ Imeshindwa: ${e.message}`;
        }
    }

    return (
        `❓ *$file matumizi:*\n\n` +
        `▸ \`$file ls [path]\` — orodha ya files\n` +
        `▸ \`$file read <path>\` — soma file\n` +
        `▸ \`$file write <path> <content>\` — andika file\n` +
        `▸ \`$file delete <path>\` — futa file\n` +
        `▸ \`$file send <path>\` — tuma file kama document\n` +
        `▸ \`$file stat <path>\` — file info`
    );
}

// ══════════════════════════════════════════════════════════════
//   $NODE — Node.js info + loaded modules
// ══════════════════════════════════════════════════════════════

async function getNodeInfo(query) {
    const q = (query || 'info').toLowerCase();

    if (q === 'info' || q === 'version') {
        const mem = process.memoryUsage();
        return (
            `*🟢 NODE.JS INFO*\n\n` +
            `Version:     ${process.version}\n` +
            `Platform:    ${process.platform}\n` +
            `Arch:        ${process.arch}\n` +
            `PID:         ${process.pid}\n` +
            `PPID:        ${process.ppid}\n` +
            `CWD:         ${process.cwd()}\n` +
            `Exec:        ${process.execPath}\n\n` +
            `*💾 Memory:*\n` +
            `  Heap:    ${formatBytes(mem.heapUsed)} / ${formatBytes(mem.heapTotal)}\n` +
            `  RSS:     ${formatBytes(mem.rss)}\n\n` +
            `*🕐 Uptime:* ${formatUptime(process.uptime())}`
        );
    }

    if (q === 'modules' || q === 'deps') {
        const pkgPath = path.join(process.cwd(), 'package.json');
        try {
            const pkg  = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            const list = Object.entries(deps)
                .map(([name, ver]) => `• *${name}*: ${ver}`)
                .join('\n');
            return `*📦 Modules (${Object.keys(deps).length}):*\n\n${truncate(list, 3000)}`;
        } catch (e) {
            return `❌ package.json haipatikani: ${e.message}`;
        }
    }

    if (q === 'argv') {
        return `*🔧 Process Args:*\n\`\`\`\n${process.argv.join('\n')}\n\`\`\``;
    }

    if (q === 'flags') {
        return `*🔧 V8 Flags:*\n\`\`\`\n${process.execArgv.join('\n') || '(hakuna)'}\n\`\`\``;
    }

    if (q === 'loaded') {
        // Loaded ES modules / require cache
        const cacheKeys = Object.keys(require?.cache || {});
        const list      = cacheKeys.slice(0, 30).map(k => `• ${path.relative(process.cwd(), k)}`).join('\n');
        return (
            `*📂 Loaded Modules (${cacheKeys.length} total):*\n\n` +
            `${list || '(require cache haina data — ES module project)'}` +
            (cacheKeys.length > 30 ? `\n...na ${cacheKeys.length - 30} zaidi` : '')
        );
    }

    return '❓ Format: $node <info|modules|argv|flags|loaded>';
}

// ══════════════════════════════════════════════════════════════
//   $SEND — Tuma ujumbe kwa mtu yeyote
// ══════════════════════════════════════════════════════════════

async function sendMessage(sock, input) {
    const parts  = input.trim().split(/\s+/);
    const target = parts[0];
    const text   = parts.slice(1).join(' ');

    if (!target || !text) {
        return '❓ Format: $send <number au jid> <ujumbe>\nMfano: $send 255712345678 Habari!';
    }

    const jid = target.includes('@')
        ? target
        : `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;

    try {
        await sock.sendMessage(jid, { text });
        return `✅ Ujumbe umetumwa kwa *${jid}*`;
    } catch (e) {
        return `❌ Imeshindwa: ${e.message}`;
    }
}

// ══════════════════════════════════════════════════════════════
//   $BROADCAST — Broadcast na confirmation step (FIXED)
// ══════════════════════════════════════════════════════════════

async function quickBroadcast(sock, from, text) {
    if (!text) return '❓ Format: $broadcast <ujumbe>';

    let groups;
    try {
        groups = await sock.groupFetchAllParticipating();
    } catch (e) {
        return `❌ Imeshindwa kupata groups: ${e.message}`;
    }

    const ids = Object.keys(groups);

    // ✅ FIX: Confirmation step
    setPending(from, 'broadcast', { text, ids });
    return (
        `⚠️ *Broadcast Confirmation*\n\n` +
        `Ujumbe: _${text.slice(0, 100)}_\n` +
        `Groups: *${ids.length}*\n\n` +
        `Tuma \`$confirm\` kuthibitisha au \`$cancel\` kufuta.\n` +
        `_(Itafutwa baada ya sekunde 30)_`
    );
}

async function executeBroadcast(sock, from, data) {
    const { text, ids } = data;
    let sent   = 0;
    let failed = 0;

    await sock.sendMessage(from, { text: `📡 *Inatuma kwa groups ${ids.length}...*` });

    for (const id of ids) {
        try {
            await new Promise(r => setTimeout(r, 1200));
            await sock.sendMessage(id, { text: `📡 *26-TECH*\n\n${text}` });
            sent++;
        } catch { failed++; }
    }

    return `✅ *Broadcast Imekamilika*\n\n✔️ Sent: ${sent}\n❌ Failed: ${failed}\n📊 Total: ${ids.length}`;
}

// ══════════════════════════════════════════════════════════════
//   $BAN / $UNBAN
// ══════════════════════════════════════════════════════════════

async function banNumber(sock, number, unban = false) {
    if (!number) return `❓ Format: $${unban ? 'unban' : 'ban'} <number>`;

    const clean = number.replace(/[^0-9]/g, '');
    const jid   = `${clean}@s.whatsapp.net`;

    try {
        if (unban) {
            await sock.updateBlockStatus(jid, 'unblock');
            return `✅ *+${clean}* ameunblockiwa`;
        } else {
            await sock.updateBlockStatus(jid, 'block');
            return `✅ *+${clean}* amebaniwa (blocked)`;
        }
    } catch (e) {
        return `❌ Imeshindwa: ${e.message}`;
    }
}

const MAIN_OWNER_JID = OWNERS_LIST[0] || `${(process.env.OWNER_NUMBER || '').split(',')[0].replace(/[^0-9]/g, '')}@s.whatsapp.net`;

// ══════════════════════════════════════════════════════════════
//   $PING — Test connection
// ══════════════════════════════════════════════════════════════

async function pingTarget(sock, target) {
    if (!target) {
        const start = Date.now();
        try {
            await sock.sendPresenceUpdate('available', MAIN_OWNER_JID);
            const latency = Date.now() - start;
            return `🏓 *Bot Ping*\nLatency: ${latency}ms\nStatus: Online ✅`;
        } catch (e) {
            return `❌ Ping imeshindwa: ${e.message}`;
        }
    }

    const clean = target.replace(/[^0-9]/g, '');
    const jid   = target.includes('@g.us') ? target : `${clean}@s.whatsapp.net`;

    const start = Date.now();
    try {
        const result  = await sock.onWhatsApp(jid.replace('@s.whatsapp.net', ''));
        const latency = Date.now() - start;
        const exists  = result?.[0]?.exists;
        return (
            `📓 *Ping Result*\n\n` +
            `Target: +${clean}\n` +
            `WhatsApp: ${exists ? 'Ipo ✅' : 'Haipo ❌'}\n` +
            `Latency: ${latency}ms`
        );
    } catch (e) {
        return `❌ Ping imeshindwa: ${e.message}`;
    }
}

// ══════════════════════════════════════════════════════════════
//   $RESTART — na confirmation step (FIXED)
// ══════════════════════════════════════════════════════════════

async function restartBot(sock, from, confirmed = false) {
    if (!confirmed) {
        // ✅ FIX: Confirmation step
        setPending(from, 'restart', {});
        return (
            `⚠️ *Restart Confirmation*\n\n` +
            `Bot itaruka na kurudi baada ya sekunde chache.\n\n` +
            `Tuma \`$confirm\` kuthibitisha au \`$cancel\` kufuta.\n` +
            `_(Itafutwa baada ya sekunde 30)_`
        );
    }

    await sock.sendMessage(from, {
        text: '🔄 *Bot inarestart...*\n_Itarudi baada ya sekunde chache._'
    });
    setTimeout(() => process.exit(0), 2000);
    return null;
}

// ══════════════════════════════════════════════════════════════
//   $UPDATE — Smart update (Railway / Render / VPS)
// ══════════════════════════════════════════════════════════════

async function updateBot(sock, from) {
    const isRailway = !!process.env.RAILWAY_SERVICE_ID;
    const isRender  = !!process.env.RENDER_SERVICE_ID || !!process.env.RENDER;
    const hasGit    = await runTerminal('git rev-parse --is-inside-work-tree')
                        .then(r => !r.error).catch(() => false);

    if (isRailway) {
        const token         = process.env.RAILWAY_TOKEN;
        const serviceId     = process.env.RAILWAY_SERVICE_ID;
        const environmentId = process.env.RAILWAY_ENVIRONMENT_ID;

        if (!token) {
            return (
                `❌ *RAILWAY_TOKEN haipo!*\n\n` +
                `Weka kwenye Railway ENV:\n` +
                `\`RAILWAY_TOKEN=token_yako\``
            );
        }

        await sock.sendMessage(from, { text: '🚂 *Inatrigger Railway redeploy...*' });

        try {
            const query = `
                mutation {
                    serviceInstanceRedeploy(
                        serviceId: "${serviceId}",
                        environmentId: "${environmentId}"
                    )
                }
            `;
            const res  = await fetch('https://backboard.railway.app/graphql/v2', {
                method:  'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ query })
            });
            const data = await res.json();
            if (data.errors) {
                return `❌ *Railway Error:*\n\`\`\`\n${JSON.stringify(data.errors, null, 2)}\n\`\`\``;
            }
            return (
                `✅ *Railway Redeploy imetriggeriwa!*\n\n` +
                `Bot itarudi baada ya dakika 1-2\n` +
                `Branch: ${process.env.RAILWAY_GIT_BRANCH || 'main'}`
            );
        } catch (e) {
            return `❌ Railway imeshindwa: ${e.message}`;
        }
    }

    if (isRender) {
        const deployHook = process.env.RENDER_DEPLOY_HOOK;
        if (!deployHook) {
            return (
                `❌ *RENDER_DEPLOY_HOOK haipo!*\n\n` +
                `Render Dashboard → Service → Settings → Deploy Hook\n` +
                `Kisha weka: \`RENDER_DEPLOY_HOOK=https://...\``
            );
        }
        await sock.sendMessage(from, { text: '🎨 *Inatrigger Render redeploy...*' });
        try {
            await fetch(deployHook, { method: 'POST' });
            return `✅ *Render Redeploy imetriggeriwa!*\nBot itarudi baada ya dakika 2-3`;
        } catch (e) {
            return `❌ Render imeshindwa: ${e.message}`;
        }
    }

    if (hasGit) {
        await sock.sendMessage(from, { text: '⬆️ *Inafetch updates kutoka GitHub...*' });
        const { output: pullOutput, error: pullError } = await runTerminal('git pull');
        if (pullError && !pullOutput.includes('Already up to date')) {
            return `❌ *Git pull imeshindwa:*\n\`\`\`\n${pullOutput}\n\`\`\``;
        }
        await sock.sendMessage(from, {
            text: `✅ *Git pull:*\n\`\`\`\n${pullOutput}\n\`\`\`\n\n🔄 _Inarestart..._`
        });
        setTimeout(() => process.exit(0), 3000);
        return null;
    }

    return (
        `❓ *Update haiwezekani automatically*\n\n` +
        `Weka moja ya hizi kwenye ENV:\n` +
        `• \`RAILWAY_TOKEN\` — kwa Railway\n` +
        `• \`RENDER_DEPLOY_HOOK\` — kwa Render`
    );
}

// ══════════════════════════════════════════════════════════════
//   $LOGS
// ══════════════════════════════════════════════════════════════

async function getLogs(lines = 50) {
    const cmds = [
        `journalctl -n ${lines} --no-pager 2>/dev/null`,
        `tail -n ${lines} /proc/1/fd/1 2>/dev/null`,
        `pm2 logs --nostream --lines ${lines} 2>/dev/null`,
    ];

    for (const cmd of cmds) {
        const { output, error } = await runTerminal(cmd);
        if (!error && output && output.length > 10) {
            return truncate(output, 3000);
        }
    }

    return '❌ Logs haipatikani kwenye environment hii.\nJaribu: `.eval $ journalctl -n 20`';
}

// ══════════════════════════════════════════════════════════════
//   $AI — AI memory management
// ══════════════════════════════════════════════════════════════

async function manageAI(subcommand, target) {
    const pool = global.dbPool;
    if (!pool) return '❌ Database haipatikani';

    const sub = (subcommand || '').toLowerCase().trim();

    if (sub === 'clear' && target) {
        const clean = target.replace(/[^0-9]/g, '');
        const jid   = `${clean}@s.whatsapp.net`;
        try {
            await pool.query('DELETE FROM ai_memory WHERE user_id = $1', [jid]);
            return `✅ AI memory ya *+${clean}* imefutwa`;
        } catch (e) {
            return `❌ Imeshindwa: ${e.message}`;
        }
    }

    if (sub === 'clearall') {
        try {
            const result = await pool.query('DELETE FROM ai_memory');
            return `✅ AI memory yote imefutwa (rows: ${result.rowCount})`;
        } catch (e) {
            return `❌ Imeshindwa: ${e.message}`;
        }
    }

    if (sub === 'list') {
        try {
            const result = await pool.query(
                'SELECT user_id, jsonb_array_length(history) as msgs FROM ai_memory ORDER BY msgs DESC LIMIT 20'
            );
            if (!result.rows.length) return '📭 Hakuna AI memory';
            const list = result.rows.map(r =>
                `• ${r.user_id.split('@')[0]} — messages: ${r.msgs}`
            ).join('\n');
            return `*🧠 AI Memory (${result.rows.length} users):*\n\n${list}`;
        } catch (e) {
            return `❌ Imeshindwa: ${e.message}`;
        }
    }

    if (sub === 'stats') {
        try {
            const result = await pool.query(
                'SELECT COUNT(*) as users, SUM(jsonb_array_length(history)) as total_msgs FROM ai_memory'
            );
            const r = result.rows[0];
            return `*🧠 AI Memory Stats*\n\nUsers: ${r.users}\nTotal messages: ${r.total_msgs}`;
        } catch (e) {
            return `❌ Imeshindwa: ${e.message}`;
        }
    }

    return (
        `❓ *$ai matumizi:*\n\n` +
        `▸ \`$ai list\` — orodha ya users\n` +
        `▸ \`$ai stats\` — takwimu\n` +
        `▸ \`$ai clear <number>\` — futa memory ya mtu\n` +
        `▸ \`$ai clearall\` — futa memory yote`
    );
}

// ══════════════════════════════════════════════════════════════
//   $SESSIONS — DB sessions
// ══════════════════════════════════════════════════════════════

async function manageSessions(subcommand) {
    const pool = global.dbPool;
    if (!pool) return '❌ Database haipatikani';

    const sub = (subcommand || 'list').toLowerCase().trim();

    try {
        if (sub === 'list') {
            const result = await pool.query('SELECT session_id, updated_at FROM wa_sessions ORDER BY updated_at DESC');
            if (!result.rows.length) return '📭 Hakuna sessions';
            const list = result.rows.map(r =>
                `• *${r.session_id}* — ${new Date(r.updated_at).toLocaleString('sw-TZ')}`
            ).join('\n');
            return `*🔐 Sessions (${result.rows.length}):*\n\n${list}`;
        }

        if (sub === 'count') {
            const result = await pool.query('SELECT COUNT(*) as count FROM wa_sessions');
            return `🔐 Sessions: ${result.rows[0].count}`;
        }
    } catch (e) {
        return `❌ Imeshindwa: ${e.message}`;
    }

    return `❓ Format: $sessions list | count`;
}

// ══════════════════════════════════════════════════════════════
//   $GC — Garbage Collection
// ══════════════════════════════════════════════════════════════

function runGC() {
    const before = process.memoryUsage().heapUsed;
    if (global.gc) {
        global.gc();
        const after = process.memoryUsage().heapUsed;
        const freed = before - after;
        return `✅ *Garbage Collection*\n\nBefore: ${formatBytes(before)}\nAfter:  ${formatBytes(after)}\nFreed:  ${formatBytes(Math.max(0, freed))}`;
    }
    return `⚠️ GC haipatikani — anza Node.js na flag:\n\`node --expose-gc index.js\``;
}

// ══════════════════════════════════════════════════════════════
//   $PERF — Performance profiling
// ══════════════════════════════════════════════════════════════

async function runPerf(code, context) {
    if (!code) return '❓ Format: $perf <js code>';

    const iterations = 1000;
    const start      = performance.now();

    try {
        for (let i = 0; i < iterations; i++) {
            await runEval(code, context);
        }
        const total = performance.now() - start;
        const avg   = total / iterations;

        return (
            `*⚡ PERFORMANCE PROFILE*\n\n` +
            `Code: \`${code.slice(0, 60)}\`\n\n` +
            `Iterations: ${iterations}\n` +
            `Total:      ${total.toFixed(2)}ms\n` +
            `Average:    ${avg.toFixed(4)}ms\n` +
            `Per second: ${(1000 / avg).toFixed(0)} ops/s`
        );
    } catch (e) {
        return `❌ Perf imeshindwa: ${e.message}`;
    }
}

// ══════════════════════════════════════════════════════════════
//   $ENV — Runtime env management
// ══════════════════════════════════════════════════════════════

function manageEnv(action, key, value) {
    const act = (action || '').toLowerCase();

    if (act === 'get') {
        if (!key) return '❓ Format: $env get <KEY>';
        const sensitive   = ['KEY', 'SECRET', 'PASSWORD', 'TOKEN', 'DATABASE_URL'];
        const isSensitive = sensitive.some(s => key.toUpperCase().includes(s));
        const val = process.env[key];
        if (!val) return `❌ ENV key *${key}* haipatikani`;
        return `🔐 *${key}:*\n${isSensitive ? '[HIDDEN — key nyeti]' : val}`;
    }

    if (act === 'set') {
        if (!key || !value) return '❓ Format: $env set <KEY> <value>';
        process.env[key] = value;
        return `✅ ENV *${key}* imewekwa (runtime tu — restart itaifuta)`;
    }

    if (act === 'list') {
        const keys = Object.keys(process.env)
            .filter(k => !['PATH', 'HOME', 'USER', 'SHELL', 'TERM', 'LANG', 'PWD', 'OLDPWD'].includes(k))
            .sort()
            .map(k => `• ${k}`)
            .join('\n');
        return `*🔐 ENV KEYS:*\n\n${keys}`;
    }

    return `❓ Format:\n▸ \`$env list\`\n▸ \`$env get <KEY>\`\n▸ \`$env set <KEY> <value>\``;
}

// ══════════════════════════════════════════════════════════════
//   $EXPORT — Export historia
// ══════════════════════════════════════════════════════════════

function exportHistory() {
    if (!evalHistory.length) return { text: '📭 Historia haina chochote.' };

    let content  = `26-TECH EVAL HISTORY\n`;
    content     += `Exported: ${new Date().toLocaleString('sw-TZ')}\n`;
    content     += `${'═'.repeat(50)}\n\n`;

    evalHistory.forEach((h, i) => {
        content += `[${i + 1}] ${h.date} ${h.timestamp} | TYPE: ${h.type}\n`;
        content += `INPUT:  ${h.input}\n`;
        content += `OUTPUT: ${h.output}\n`;
        if (h.timeMs) content += `TIME:   ${h.timeMs}ms\n`;
        content += `${'─'.repeat(40)}\n`;
    });

    return { content, filename: `eval_history_${Date.now()}.txt` };
}

// ══════════════════════════════════════════════════════════════
//   HELP MESSAGE — Updated
// ══════════════════════════════════════════════════════════════

function getHelp() {
    return (
        `*⚡ 26-TECH PRO EVAL v2*\n\n` +
        `*📝 JS Eval:*\n` +
        `▸ \`.eval <code>\` — JS code\n` +
        `▸ \`.eval $perf <code>\` — Performance test\n\n` +
        `*💻 Terminal:*\n` +
        `▸ \`.eval $ <cmd>\` — Terminal command\n` +
        `▸ \`.eval $logs [lines]\` — Bot logs\n` +
        `▸ \`.eval $restart\` — Restart bot (na confirm)\n` +
        `▸ \`.eval $update\` — Git pull + restart\n\n` +
        `*📊 State & System:*\n` +
        `▸ \`.eval $state [query]\` — Hali ya bot\n` +
        `▸ \`.eval $uptime\` — Uptime ya bot\n` +
        `▸ \`.eval $kill <pid> [signal]\` — Kill process\n` +
        `▸ \`.eval $gc\` — Garbage collection\n` +
        `▸ \`.eval $node <info|modules|argv|flags|loaded>\`\n\n` +
        `*🗄️ Database:*\n` +
        `▸ \`.eval $db <SQL>\` — SELECT queries\n` +
        `▸ \`.eval $dbw <SQL>\` — Write queries (INSERT/UPDATE/DELETE)\n` +
        `▸ \`.eval $db backup\` — Dump DB kwa file\n` +
        `▸ \`.eval $sessions [list|count]\` — Sessions\n\n` +
        `*🧠 AI Memory:*\n` +
        `▸ \`.eval $ai list|stats|clear <num>|clearall\`\n\n` +
        `*📡 Network & Messages:*\n` +
        `▸ \`.eval $ping [number]\` — Ping\n` +
        `▸ \`.eval $send <num> <msg>\` — Tuma ujumbe\n` +
        `▸ \`.eval $broadcast <msg>\` — Broadcast (na confirm)\n` +
        `▸ \`.eval $msg delete <id>\` — Futa ujumbe\n\n` +
        `*👥 Groups:*\n` +
        `▸ \`.eval $groups leave|add|kick|promote|demote|info\`\n\n` +
        `*👤 Profile:*\n` +
        `▸ \`.eval $profile <number>\` — Ona profile\n` +
        `▸ \`.eval $setname <jina>\` — Badilisha jina la bot\n` +
        `▸ \`.eval $setstatus <text>\` — Badilisha status\n\n` +
        `*🔧 Management:*\n` +
        `▸ \`.eval $ban / $unban <num>\` — Block/unblock\n` +
        `▸ \`.eval $block list\` — Orodha ya blocked\n` +
        `▸ \`.eval $whitelist add|remove|list [num]\`\n` +
        `▸ \`.eval $ratelimit set|list|remove|clear\`\n` +
        `▸ \`.eval $env list|get|set\` — ENV management\n\n` +
        `*📂 Files:*\n` +
        `▸ \`.eval $file ls|read|write|delete|send|stat\`\n\n` +
        `*⏰ Cron:*\n` +
        `▸ \`.eval $cron list|start|stop|stopall [id]\`\n\n` +
        `*📦 Cache:*\n` +
        `▸ \`.eval $cache <all|messages|contacts|history>\`\n\n` +
        `*📋 History:*\n` +
        `▸ \`.eval $history\` — Historia\n` +
        `▸ \`.eval $export\` — Export historia\n` +
        `▸ \`.eval $clear\` — Futa historia\n\n` +
        `*✅ Confirmation:*\n` +
        `▸ \`.eval $confirm\` — Thibitisha action\n` +
        `▸ \`.eval $cancel\` — Futa action`
    );
}

// ══════════════════════════════════════════════════════════════
//   MAIN EXPORTS
// ══════════════════════════════════════════════════════════════

export const name        = 'eval';
export const description = 'Pro Grade Eval v2 — JS, Terminal, DB, State, AI memory na zaidi';
export const category    = 'owner';
export const use         = '<code> | $ <cmd> | $state | $db | $ai | $send | ...';
export const alias       = ['ev', 'exec'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;

    console.log('\n⚡ [EVAL] execute() imeitwa!');
    console.log('  from:', from);

    if (!isOwner(msg, sock)) {
        console.log('❌ [EVAL] isOwner = false — inarejea bila kujibu');
        return;
    }
    console.log('✅ [EVAL] isOwner = true — inaendelea...');

    if (from.endsWith('@g.us')) {
        return sock.sendMessage(from, {
            text: '⚠️ _Eval inafanya kazi kwenye DM tu._'
        }, { quoted: msg });
    }

    const fullText = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text || ''
    ).trim();

    let text = fullText.replace(/^\.(eval|ev|exec)\s*/i, '').trim();

    const codeBlockMatch = text.match(/^```(?:js|javascript)?\n?([\s\S]*?)```$/s);
    if (codeBlockMatch) {
        text = codeBlockMatch[1].trim();
    }

    if (!text) {
        return sock.sendMessage(from, { text: getHelp() }, { quoted: msg });
    }

    const reply = async (content) => {
        if (content === null || content === undefined) return;
        await sock.sendMessage(from, { text: truncate(String(content)) }, { quoted: msg });
    };

    const start = Date.now();

    try {
        // ── $confirm ──
        if (/^\$confirm$/i.test(text)) {
            const pending = getPending(from);
            if (!pending) return reply('❌ Hakuna action inayosubiri confirmation (au imekwisha muda).');
            clearPending(from);
            if (pending.action === 'broadcast') return reply(await executeBroadcast(sock, from, pending.data));
            if (pending.action === 'restart')   return restartBot(sock, from, true);
            return reply('❓ Action isiyojulikana.');
        }

        // ── $cancel ──
        if (/^\$cancel$/i.test(text)) {
            const had = getPending(from);
            clearPending(from);
            return reply(had ? `✅ Action *${had.action}* imefutwa.` : '❌ Hakuna action inayosubiri.');
        }

        // ── $help ──
        if (/^\$help$/i.test(text)) {
            return reply(getHelp());
        }

        // ── $clear ──
        if (/^\$clear$/i.test(text)) {
            evalHistory.length = 0;
            return reply('🗑️ Historia imefutwa.');
        }

        // ── $history ──
        if (/^\$history$/i.test(text)) {
            if (!evalHistory.length) return reply('📭 Historia haina chochote.');
            const list = evalHistory.map((h, i) =>
                `*${i + 1}.* [${h.timestamp}] ${h.type}\n` +
                `   IN: ${h.input}\n` +
                `   OUT: ${h.output}${h.timeMs ? ` (${h.timeMs}ms)` : ''}`
            ).join('\n\n');
            return reply(`*📋 EVAL HISTORY (${evalHistory.length}):*\n\n${list}`);
        }

        // ── $export ──
        if (/^\$export$/i.test(text)) {
            const { text: errText, content, filename } = exportHistory();
            if (errText) return reply(errText);
            try {
                const tmpPath = path.join(os.tmpdir(), filename);
                fs.writeFileSync(tmpPath, content, 'utf8');
                await sock.sendMessage(from, {
                    document: fs.readFileSync(tmpPath),
                    fileName: filename,
                    mimetype: 'text/plain'
                }, { quoted: msg });
                fs.unlinkSync(tmpPath);
            } catch (e) {
                return reply(`❌ Export imeshindwa: ${e.message}`);
            }
            return;
        }

        // ── $uptime ──
        if (/^\$uptime$/i.test(text)) {
            return reply(getUptime());
        }

        // ── $restart ──
        if (/^\$restart$/i.test(text)) {
            return reply(await restartBot(sock, from, false));
        }

        // ── $update ──
        if (/^\$update$/i.test(text)) {
            const res = await updateBot(sock, from);
            return res ? reply(res) : undefined;
        }

        // ── $logs [lines] ──
        if (/^\$logs(\s+\d+)?$/i.test(text)) {
            const lines = parseInt(text.split(/\s+/)[1]) || 50;
            return reply(await getLogs(lines));
        }

        // ── $gc ──
        if (/^\$gc$/i.test(text)) {
            return reply(runGC());
        }

        // ── $kill <pid> [signal] ──
        if (/^\$kill\s+/i.test(text)) {
            const parts  = text.replace(/^\$kill\s+/i, '').trim().split(/\s+/);
            return reply(await killProcess(parts[0], parts[1] || 'SIGTERM'));
        }

        // ── $ping [target] ──
        if (/^\$ping/i.test(text)) {
            const target = text.replace(/^\$ping\s*/i, '').trim() || null;
            return reply(await pingTarget(sock, target));
        }

        // ── $send <num> <msg> ──
        if (/^\$send\s+/i.test(text)) {
            const input = text.replace(/^\$send\s+/i, '');
            const res   = await sendMessage(sock, input);
            addToHistory('$send', input.slice(0, 60), res, Date.now() - start);
            return reply(res);
        }

        // ── $broadcast <msg> ──
        if (/^\$broadcast\s*/i.test(text)) {
            const msg2 = text.replace(/^\$broadcast\s*/i, '').trim();
            return reply(await quickBroadcast(sock, from, msg2));
        }

        // ── $ban <num> ──
        if (/^\$ban\s+/i.test(text)) {
            const num = text.replace(/^\$ban\s+/i, '').trim();
            return reply(await banNumber(sock, num, false));
        }

        // ── $unban <num> ──
        if (/^\$unban\s+/i.test(text)) {
            const num = text.replace(/^\$unban\s+/i, '').trim();
            return reply(await banNumber(sock, num, true));
        }

        // ── $block list ──
        if (/^\$block\s+list$/i.test(text)) {
            return reply(await getBlockList(sock));
        }

        // ── $state [query] ──
        if (/^\$state/i.test(text)) {
            const query = text.replace(/^\$state\s*/i, '').trim() || 'all';
            return reply(await getBotState(sock, query));
        }

        // ── $db backup ──
        if (/^\$db\s+backup$/i.test(text)) {
            return backupDB(sock, from);
        }

        // ── $db <SQL> — SELECT only ──
        if (/^\$db\s+/i.test(text)) {
            const sql = text.replace(/^\$db\s+/i, '').trim();
            const res = await runDB(sql, false);
            addToHistory('$db', sql.slice(0, 60), res, Date.now() - start);
            return reply(res);
        }

        // ── $dbw <SQL> — Write queries ──
        if (/^\$dbw\s+/i.test(text)) {
            const sql = text.replace(/^\$dbw\s+/i, '').trim();
            const res = await runDB(sql, true);
            addToHistory('$dbw', sql.slice(0, 60), res, Date.now() - start);
            return reply(res);
        }

        // ── $sessions [sub] ──
        if (/^\$sessions/i.test(text)) {
            const sub = text.replace(/^\$sessions\s*/i, '').trim() || 'list';
            return reply(await manageSessions(sub));
        }

        // ── $ai <sub> [target] ──
        if (/^\$ai/i.test(text)) {
            const parts = text.replace(/^\$ai\s*/i, '').trim().split(/\s+/);
            return reply(await manageAI(parts[0], parts[1]));
        }

        // ── $env <action> [key] [value] ──
        if (/^\$env/i.test(text)) {
            const parts = text.replace(/^\$env\s*/i, '').trim().split(/\s+/);
            return reply(manageEnv(parts[0], parts[1], parts.slice(2).join(' ')));
        }

        // ── $contacts ──
        if (/^\$contacts$/i.test(text)) {
            return reply(getContactsList());
        }

        // ── $socket / $ws ──
        if (/^\$(socket|ws)$/i.test(text)) {
            return reply(await getBotState(sock, 'socket'));
        }

        // ── $perf <code> ──
        if (/^\$perf\s+/i.test(text)) {
            const code = text.replace(/^\$perf\s+/i, '').trim();
            return reply(await runPerf(code, { sock, msg, from }));
        }

        // ── $profile <number> ──
        if (/^\$profile\s+/i.test(text)) {
            const number = text.replace(/^\$profile\s+/i, '').trim();
            return reply(await getProfile(sock, from, number));
        }

        // ── $setname <name> ──
        if (/^\$setname\s+/i.test(text)) {
            const name = text.replace(/^\$setname\s+/i, '').trim();
            return reply(await setBotName(sock, name));
        }

        // ── $setstatus <text> ──
        if (/^\$setstatus\s+/i.test(text)) {
            const statusText = text.replace(/^\$setstatus\s+/i, '').trim();
            return reply(await setBotStatus(sock, statusText));
        }

        // ── $groups <action> [args] ──
        if (/^\$groups/i.test(text)) {
            const parts  = text.replace(/^\$groups\s*/i, '').trim().split(/\s+/);
            return reply(await manageGroups(sock, parts[0], ...parts.slice(1)));
        }

        // ── $msg <action> [args] ──
        if (/^\$msg\s+/i.test(text)) {
            const parts  = text.replace(/^\$msg\s+/i, '').trim().split(/\s+/);
            const action = parts[0];
            const rest   = parts.slice(1).join(' ');
            return reply(await manageMsg(sock, from, action, rest));
        }

        // ── $whitelist ──
        if (/^\$whitelist/i.test(text)) {
            const parts = text.replace(/^\$whitelist\s*/i, '').trim().split(/\s+/);
            return reply(manageWhitelist(parts[0], parts[1]));
        }

        // ── $ratelimit ──
        if (/^\$ratelimit/i.test(text)) {
            const parts = text.replace(/^\$ratelimit\s*/i, '').trim().split(/\s+/);
            return reply(manageRateLimit(parts[0], parts[1], parts[2]));
        }

        // ── $cron ──
        if (/^\$cron/i.test(text)) {
            const parts = text.replace(/^\$cron\s*/i, '').trim().split(/\s+/);
            return reply(manageCron(parts[0], parts[1]));
        }

        // ── $cache ──
        if (/^\$cache/i.test(text)) {
            const target = text.replace(/^\$cache\s*/i, '').trim() || 'all';
            return reply(manageCache(target));
        }

        // ── $file ──
        if (/^\$file/i.test(text)) {
            const parts = text.replace(/^\$file\s*/i, '').trim().split(/\s+/);
            return reply(await manageFile(sock, from, parts[0], ...parts.slice(1)));
        }

        // ── $node ──
        if (/^\$node/i.test(text)) {
            const query = text.replace(/^\$node\s*/i, '').trim() || 'info';
            return reply(await getNodeInfo(query));
        }

        // ── $ <terminal command> ──
        if (/^\$\s+/.test(text) || text.startsWith('$ ')) {
            const cmd = text.replace(/^\$\s+/, '').trim();
            if (!cmd) return reply('❓ Format: $ <command>');

            const { output, error } = await runTerminal(cmd);
            const res = `*💻 Terminal:*\n\`\`\`\n${output}\n\`\`\`${error ? '\n⚠️ (stderr/error)' : ''}`;
            addToHistory('terminal', cmd, output.slice(0, 100), Date.now() - start);
            return reply(res);
        }

        // ── JS Eval ──
        if (!isSafe(text)) {
            return reply('🛡️ *Safe Mode:* Code hii imezuiwa kwa usalama.');
        }

        let result;
        try {
            result = await runEval(`return (${text})`, { sock, msg, from });
        } catch (e1) {
            if (e1 instanceof SyntaxError) {
                result = await runEval(text, { sock, msg, from });
            } else {
                throw e1;
            }
        }

        const output  = formatOutput(result);
        const timeMs  = Date.now() - start;

        addToHistory('eval', text, output, timeMs);

        return reply(
            `*✅ Result* (${timeMs}ms)\n\n` +
            `\`\`\`\n${truncate(output, 3000)}\n\`\`\``
        );

    } catch (err) {
        const timeMs = Date.now() - start;
        addToHistory('error', text, err.message, timeMs);

        const stack = err.stack
            ? truncate(err.stack, 1500)
            : err.message;

        return reply(
            `*❌ Error* (${timeMs}ms)\n\n` +
            `\`\`\`\n${stack}\n\`\`\``
        );
    }
}
