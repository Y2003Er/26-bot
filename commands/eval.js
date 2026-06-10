/**
 * commands/eval.js
 * ─────────────────────────────────────────────────────────────
 * PRO GRADE EVAL — Owner peke yake
 * ─────────────────────────────────────────────────────────────
 * Features:
 * ✅ JS eval (async/await + context variables)
 * ✅ Terminal commands ($)
 * ✅ Bot state inspection ($state)
 * ✅ Database queries ($db)
 * ✅ Command history + export ($history, $export)
 * ✅ Safe mode (block hatari)
 * ✅ Timeout protection (15s)
 * ✅ Multi-line code (code blocks)
 * ✅ Full error stack trace
 * ✅ $restart — restart bot
 * ✅ $update — pull GitHub + restart
 * ✅ $logs — bot logs za mwisho
 * ✅ $ping — test connection
 * ✅ $send — tuma ujumbe kwa mtu yeyote
 * ✅ $broadcast — broadcast haraka
 * ✅ $ban / $unban — block/unblock number
 * ✅ $clear — futa historia
 * ✅ $socket — WebSocket state
 * ✅ $perf — performance profiling
 * ✅ $contacts — orodha ya contacts
 * ✅ $gc — garbage collection
 * ✅ $env get/set — manage env runtime
 * ✅ $ai clear — futa AI memory ya mtu
 * ✅ $sessions — angalia sessions za DB
 * ── NEW ──────────────────────────────────────────────────────
 * ✅ $uptime — dedicated uptime + bot start time
 * ✅ $kill <pid> [signal] — kill process na safety check
 * ✅ $cron list/start/stop/stopall — manage scheduled jobs
 * ✅ $cache clear <all/messages/contacts/history> — clear cache
 * ✅ $block list — orodha ya blocked numbers
 * ✅ $groups leave/add/kick/promote/demote/info — group management
 * ✅ $msg delete <id> — delete message by ID
 * ✅ $profile <number> — profile picture + status
 * ✅ $setname <name> — badilisha jina la bot
 * ✅ $setstatus <text> — badilisha bio/status
 * ✅ $whitelist add/remove/list — manage allowed numbers
 * ✅ $ratelimit set/list/remove/clear — rate limiting per command
 * ✅ $db backup — pg_dump kwa file
 * ✅ $file ls/read/write/delete/send/stat — file system management
 * ✅ $node info/modules/argv/flags/loaded — Node.js diagnostics
 * ✅ $confirm / $cancel — confirmation system ya hatua kubwa
 * ─────────────────────────────────────────────────────────────
 */

import { exec }    from 'child_process';
import util        from 'util';
import os          from 'os';
import fs          from 'fs';
import path        from 'path';

// ── Bot start time (mara moja tu) ──
const BOT_START_TIME = new Date();

// ── Owner check ──
// OWNER_NUMBER kwenye .env = namba za simu (255...)
// global.ownerLid = LID ya owner — inawekwa na index.js wakati connection inafunguka
//   (sock.user.lid) — LID ni tofauti na namba ya simu, haiwezi kujulikana mapema

function getOwnersList() {
    // Kusanya namba kutoka env keys zote zinazowezekana
    const rawKeys = [
        process.env.OWNER_NUMBER,
        process.env.OWNER_NUMBERS,
        process.env.PHONE_NUMBER,
        process.env.SUDO_USERS,
    ];
    const all = rawKeys
        .filter(Boolean)
        .flatMap(val => val.split(','))
        .map(num => `${num.replace(/[^0-9]/g, '')}@s.whatsapp.net`)
        .filter(jid => jid !== '@s.whatsapp.net');
    return [...new Set(all)];
}

function getOwnerLids() {
    // OWNER_LID kwenye .env — LID numbers za owners (e.g. 40304560349344)
    // Zinaweza kuwa nyingi: OWNER_LID=40304560349344,12345678
    const raw = process.env.OWNER_LID || '';
    return raw
        .split(',')
        .map(s => s.trim().replace(/[^0-9]/g, ''))
        .filter(Boolean);
}

function normalizeJid(jid) {
    if (!jid) return '';
    return jid.split(':')[0].split('@')[0] + '@s.whatsapp.net';
}

function isOwner(msg, sock) {
    if (!msg || !sock) return false;

    const OWNER_NUMBER = (process.env.OWNER_NUMBER || "255753495142").toString().trim();
    const isGroup = msg.key.remoteJid?.endsWith('@g.us');

    // Pata sender sahihi
    let senderJid = isGroup
        ? (msg.key.participant || '')
        : (msg.key.remoteJid || '');

    if (!senderJid) return false;

    console.log(`[EVAL] Raw senderJid: ${senderJid}`);
    console.log(`[EVAL] sock.user.lid: ${sock?.user?.lid || 'haipo'}`);
    console.log(`[EVAL] OWNER_NUMBER: ${OWNER_NUMBER}`);

    // ==================== NORMALIZER ====================
    const normalize = (jid) => {
        if (!jid) return '';
        return String(jid)
            .split(':')[0]
            .replace(/@lid|@s\.whatsapp\.net/g, '')
            .replace(/[^0-9]/g, '');
    };

    const senderClean = normalize(senderJid);
    const ownerClean  = normalize(OWNER_NUMBER);

    // 1. Normal number match
    if (senderClean === ownerClean || senderJid.includes(OWNER_NUMBER)) {
        console.log('✅ [EVAL] Owner match - Normal Number');
        return true;
    }

    // 2. LID match
    if (senderJid.endsWith('@lid') || senderJid.includes('@lid')) {
        const senderLidClean = normalize(senderJid);

        // OWNER_LID kutoka .env
        const ownerLid = (process.env.OWNER_LID || '').toString().trim();
        if (ownerLid) {
            const ownerLidClean = normalize(ownerLid);
            if (senderLidClean === ownerLidClean) {
                console.log('✅ [EVAL] Owner match - OWNER_LID env');
                return true;
            }
        }

        // sock.user.lid
        if (sock?.user?.lid) {
            const botLidClean = normalize(sock.user.lid);
            if (senderLidClean === botLidClean) {
                console.log('✅ [EVAL] Owner match - sock.user.lid');
                return true;
            }
        }

        // global.ownerLid
        if (global.ownerLid) {
            const globalLidClean = normalize(global.ownerLid);
            if (senderLidClean === globalLidClean) {
                console.log('✅ [EVAL] Owner match - global.ownerLid');
                return true;
            }
        }
    }

    // 3. fromMe (safety)
    if (msg.key.fromMe === true) {
        console.log('✅ [EVAL] Owner match - fromMe');
        return true;
    }

    console.log(`❌ [EVAL] No match | senderClean: ${senderClean}`);
    return false;
}
// ── History ──
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

// ── Whitelist (in-memory, reset kila restart) ──
// Kwa persistence, hifadhi kwenye DB au file
if (!global.evalWhitelist) global.evalWhitelist = new Set();

// ── Rate limit store ──
if (!global.evalRateLimits) global.evalRateLimits = new Map();
// Format: { commandName: { maxCalls: number, windowMs: number } }

if (!global.evalRateLimitCounters) global.evalRateLimitCounters = new Map();
// Format: { "jid:commandName": [timestamps...] }

// ── Confirmation store ──
if (!global.evalPendingConfirm) global.evalPendingConfirm = new Map();
// Format: { jid: { action: fn, description: string, timeout: NodeJS.Timeout } }

// ── Cron job store ──
if (!global.evalCronJobs) global.evalCronJobs = new Map();
// Format: { name: { interval: NodeJS.Timeout, description: string, startedAt: Date } }

// ── Safe mode ──
const BLOCKED_PATTERNS = [
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
];

function isSafe(code) {
    return !BLOCKED_PATTERNS.some(p => p.test(code));
}

// ── Utilities ──
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
    let list = `*👥 Orodha ya Contacts zipatazo (${contacts.size}):*\n\n`;
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

// ── Terminal ──
async function runTerminal(command, cwd = process.cwd()) {
    return new Promise((resolve) => {
        exec(command, {
            timeout:   15000,
            maxBuffer: 2 * 1024 * 1024,
            cwd
        }, (error, stdout, stderr) => {
            const output = stdout || stderr || error?.message || '(hakuna output)';
            resolve({ output: output.trim(), error: !!error, code: error?.code });
        });
    });
}

// ── JS Eval na timeout + context ──
async function runEval(code, context) {
    const { sock, msg, from } = context;
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const fn = new AsyncFunction(
        'sock', 'msg', 'from', 'global', 'process', 'require',
        `
        const store = global;
        ${code}
        `
    );
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('⏱️ Timeout — imechukua zaidi ya sekunde 15')), 15000)
    );
    return Promise.race([
        fn(sock, msg, from, global, process, (m) => import(m)),
        timeout
    ]);
}

// ════════════════════════════════════════════════
//   $UPTIME — Dedicated uptime display
// ════════════════════════════════════════════════
function getUptime() {
    const upSecs  = process.uptime();
    const startAt = BOT_START_TIME.toLocaleString('sw-TZ', {
        weekday: 'long', year: 'numeric', month: 'long',
        day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const now = new Date().toLocaleString('sw-TZ', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    // Exact uptime breakdown
    const d = Math.floor(upSecs / 86400);
    const h = Math.floor((upSecs % 86400) / 3600);
    const m = Math.floor((upSecs % 3600) / 60);
    const s = Math.floor(upSecs % 60);

    return (
        `*⏱️ BOT UPTIME*\n\n` +
        `🚀 *Ilianzishwa:* ${startAt}\n` +
        `🕐 *Wakati Sasa:* ${now}\n\n` +
        `*Uptime:* ${d > 0 ? `${d} siku, ` : ''}${h > 0 ? `${h} saa, ` : ''}${m > 0 ? `${m} dakika, ` : ''}${s} sekunde\n` +
        `*(${formatUptime(upSecs)} jumla)*\n\n` +
        `*Process ID:* ${process.pid}`
    );
}

// ════════════════════════════════════════════════
//   $KILL — Kill process by PID
// ════════════════════════════════════════════════
function killProcess(pid, signal = 'SIGTERM') {
    if (!pid) return '❓ Format: $kill <pid> [signal]\nMfano: $kill 1234 SIGTERM';

    const pidNum = parseInt(pid);
    if (isNaN(pidNum)) return `❌ PID si nambari halali: ${pid}`;

    // Safety: usikill process muhimu
    const PROTECTED_PIDS = [1, process.pid];
    if (PROTECTED_PIDS.includes(pidNum)) {
        return `🛡️ *Safety Check:* PID ${pidNum} imezuiwa (${pidNum === 1 ? 'init/PID 1' : 'bot process yenyewe'})`;
    }

    const VALID_SIGNALS = [
        'SIGTERM', 'SIGKILL', 'SIGINT', 'SIGHUP', 'SIGSTOP',
        'SIGCONT', 'SIGUSR1', 'SIGUSR2', '9', '15'
    ];
    const sig = signal.toUpperCase();
    if (!VALID_SIGNALS.includes(sig)) {
        return `❌ Signal isiyojulikana: *${sig}*\nSignals halali: ${VALID_SIGNALS.join(', ')}`;
    }

    try {
        process.kill(pidNum, sig);
        return `✅ Signal *${sig}* imetumwa kwa PID *${pidNum}*`;
    } catch (e) {
        if (e.code === 'ESRCH') return `❌ PID ${pidNum} haipatikani (process haipo)`;
        if (e.code === 'EPERM') return `❌ Ruhusa imekatazwa kwa PID ${pidNum}`;
        return `❌ Imeshindwa: ${e.message}`;
    }
}

// ════════════════════════════════════════════════
//   $CRON — Manage scheduled jobs
// ════════════════════════════════════════════════
async function manageCron(subcommand, args, sock, from) {
    const sub = (subcommand || 'list').toLowerCase().trim();

    if (sub === 'list') {
        if (global.evalCronJobs.size === 0) return '📭 Hakuna cron jobs zilizosajiliwa.';
        let out = `*⏰ CRON JOBS (${global.evalCronJobs.size}):*\n\n`;
        for (const [name, job] of global.evalCronJobs.entries()) {
            const elapsed = formatUptime((Date.now() - job.startedAt.getTime()) / 1000);
            out += `• *${name}*\n`;
            out += `  📝 ${job.description}\n`;
            out += `  ⏱️ Interval: kila ${job.intervalMs / 1000}s\n`;
            out += `  🕐 Imeanza: ${elapsed} iliyopita\n\n`;
        }
        return out.trim();
    }

    // $cron start <name> <intervalSeconds> <description>
    if (sub === 'start') {
        // args = ["<name>", "<secs>", ...description]
        const parts = (args || '').trim().split(/\s+/);
        const name  = parts[0];
        const secs  = parseInt(parts[1]);
        const desc  = parts.slice(2).join(' ') || 'Hakuna maelezo';

        if (!name || isNaN(secs) || secs < 10) {
            return '❓ Format: $cron start <name> <sekunde≥10> [maelezo]\nMfano: $cron start heartbeat 60 Piga ping kila dakika';
        }
        if (global.evalCronJobs.has(name)) {
            return `❌ Cron job *${name}* tayari ipo. Imalize kwanza: \`$cron stop ${name}\``;
        }

        const intervalMs = secs * 1000;
        const interval   = setInterval(async () => {
            try {
                await sock.sendMessage(from, {
                    text: `⏰ *Cron Job: ${name}*\n${desc}\n_${new Date().toLocaleString('sw-TZ')}_`
                });
            } catch {}
        }, intervalMs);

        global.evalCronJobs.set(name, {
            interval,
            description: desc,
            intervalMs,
            startedAt:   new Date()
        });

        return `✅ Cron job *${name}* imeanza!\n📝 ${desc}\n⏱️ Kila sekunde ${secs}`;
    }

    if (sub === 'stop') {
        const name = (args || '').trim();
        if (!name) return '❓ Format: $cron stop <name>';
        const job = global.evalCronJobs.get(name);
        if (!job) return `❌ Cron job *${name}* haipatikani`;
        clearInterval(job.interval);
        global.evalCronJobs.delete(name);
        return `✅ Cron job *${name}* imesimamishwa.`;
    }

    if (sub === 'stopall') {
        const count = global.evalCronJobs.size;
        if (count === 0) return '📭 Hakuna cron jobs za kusimamisha.';
        for (const [, job] of global.evalCronJobs.entries()) clearInterval(job.interval);
        global.evalCronJobs.clear();
        return `✅ Cron jobs zote ${count} zimesimamishwa.`;
    }

    return `❓ Chaguzi za $cron:\n▸ \`$cron list\`\n▸ \`$cron start <name> <secs> [desc]\`\n▸ \`$cron stop <name>\`\n▸ \`$cron stopall\``;
}

// ════════════════════════════════════════════════
//   $CACHE — Clear cache manually
// ════════════════════════════════════════════════
function manageCache(target) {
    const t = (target || '').toLowerCase().trim();

    if (!t || t === 'help') {
        const msgSize  = global.messageCache?.size || 0;
        const conSize  = global.contactCache?.size || 0;
        const histSize = evalHistory.length;
        return (
            `*📦 CACHE INFO*\n\n` +
            `Messages:  ${msgSize} items\n` +
            `Contacts:  ${conSize} items\n` +
            `History:   ${histSize} items\n\n` +
            `Chaguzi:\n` +
            `▸ \`$cache clear messages\`\n` +
            `▸ \`$cache clear contacts\`\n` +
            `▸ \`$cache clear history\`\n` +
            `▸ \`$cache clear all\``
        );
    }

    // Support both "$cache clear all" and "$cache all"
    const action = t === 'all' || t === 'clear all' ? 'all' : t.replace(/^clear\s+/, '');

    if (action === 'messages') {
        const count = global.messageCache?.size || 0;
        global.messageCache?.clear?.();
        return `✅ Message cache imefutwa (${count} items)`;
    }

    if (action === 'contacts') {
        const count = global.contactCache?.size || 0;
        global.contactCache?.clear?.();
        return `✅ Contact cache imefutwa (${count} items)`;
    }

    if (action === 'history') {
        const count = evalHistory.length;
        evalHistory.length = 0;
        return `✅ Eval history imefutwa (${count} items)`;
    }

    if (action === 'all') {
        const msgCount  = global.messageCache?.size || 0;
        const conCount  = global.contactCache?.size || 0;
        const histCount = evalHistory.length;
        global.messageCache?.clear?.();
        global.contactCache?.clear?.();
        evalHistory.length = 0;
        return (
            `✅ *Cache yote imefutwa*\n\n` +
            `Messages:  ${msgCount} items\n` +
            `Contacts:  ${conCount} items\n` +
            `History:   ${histCount} items`
        );
    }

    return `❓ Chaguzi: messages | contacts | history | all`;
}

// ════════════════════════════════════════════════
//   $BLOCK list — Orodha ya blocked numbers
// ════════════════════════════════════════════════
async function manageBlock(sock, subcommand) {
    const sub = (subcommand || 'list').toLowerCase().trim();

    if (sub === 'list') {
        try {
            // Baileys inahifadhi blocked contacts kwenye fetchBlocklist
            const list = await sock.fetchBlocklist();
            if (!list || list.length === 0) return '📭 Hakuna nambari zilizobaniwa.';
            const formatted = list.map((jid, i) =>
                `${i + 1}. *+${jid.split('@')[0]}*`
            ).join('\n');
            return `*🚫 Blocked Numbers (${list.length}):*\n\n${formatted}`;
        } catch (e) {
            return `❌ Imeshindwa kupata blocklist: ${e.message}`;
        }
    }

    return `❓ Format: $block list`;
}

// ════════════════════════════════════════════════
//   $GROUPS — Full group management
// ════════════════════════════════════════════════
async function manageGroups(sock, subcommand, args) {
    const sub   = (subcommand || '').toLowerCase().trim();
    const parts = (args || '').trim().split(/\s+/);

    // $groups info [groupJid/subject]
    if (sub === 'info') {
        const query = parts.join(' ').trim();
        if (!query) return '❓ Format: $groups info <groupJid au sehemu ya jina>';
        try {
            const allGroups = await sock.groupFetchAllParticipating();
            // Tafuta kwa JID au kwa jina (partial match)
            const group = Object.values(allGroups).find(g =>
                g.id === query ||
                g.id.startsWith(query) ||
                g.subject?.toLowerCase().includes(query.toLowerCase())
            );
            if (!group) return `❌ Group haikupatikana: *${query}*`;
            const admins = group.participants?.filter(p => p.admin) || [];
            const members = group.participants?.length || 0;
            return (
                `*👥 Group Info*\n\n` +
                `📛 *Jina:* ${group.subject}\n` +
                `🆔 *JID:* ${group.id}\n` +
                `👤 *Wanachama:* ${members}\n` +
                `👑 *Admins:* ${admins.length}\n` +
                `📝 *Maelezo:* ${group.desc || 'Hakuna'}\n` +
                `🔒 *Restrict:* ${group.restrict ? 'Ndiyo' : 'Hapana'}\n` +
                `📢 *Announce:* ${group.announce ? 'Ndiyo' : 'Hapana'}\n` +
                `🕐 *Iliundwa:* ${group.creation ? new Date(group.creation * 1000).toLocaleDateString('sw-TZ') : '?'}`
            );
        } catch (e) {
            return `❌ Imeshindwa: ${e.message}`;
        }
    }

    // $groups leave <groupJid>
    if (sub === 'leave') {
        const jid = parts[0];
        if (!jid) return '❓ Format: $groups leave <groupJid>';
        const gid = jid.endsWith('@g.us') ? jid : `${jid}@g.us`;
        try {
            await sock.groupLeave(gid);
            return `✅ Bot ametoka kwenye group *${gid}*`;
        } catch (e) {
            return `❌ Imeshindwa: ${e.message}`;
        }
    }

    // $groups kick <groupJid> <memberJid>
    if (sub === 'kick') {
        const [gJid, mJid] = parts;
        if (!gJid || !mJid) return '❓ Format: $groups kick <groupJid> <memberNumber>';
        const gid  = gJid.endsWith('@g.us') ? gJid : `${gJid}@g.us`;
        const mjid = mJid.includes('@') ? mJid : `${mJid.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
        try {
            await sock.groupParticipantsUpdate(gid, [mjid], 'remove');
            return `✅ *+${mjid.split('@')[0]}* amefutwa kwenye group`;
        } catch (e) {
            return `❌ Imeshindwa: ${e.message}`;
        }
    }

    // $groups promote <groupJid> <memberJid>
    if (sub === 'promote') {
        const [gJid, mJid] = parts;
        if (!gJid || !mJid) return '❓ Format: $groups promote <groupJid> <memberNumber>';
        const gid  = gJid.endsWith('@g.us') ? gJid : `${gJid}@g.us`;
        const mjid = mJid.includes('@') ? mJid : `${mJid.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
        try {
            await sock.groupParticipantsUpdate(gid, [mjid], 'promote');
            return `✅ *+${mjid.split('@')[0]}* amepandishwa kuwa admin`;
        } catch (e) {
            return `❌ Imeshindwa: ${e.message}`;
        }
    }

    // $groups demote <groupJid> <memberJid>
    if (sub === 'demote') {
        const [gJid, mJid] = parts;
        if (!gJid || !mJid) return '❓ Format: $groups demote <groupJid> <memberNumber>';
        const gid  = gJid.endsWith('@g.us') ? gJid : `${gJid}@g.us`;
        const mjid = mJid.includes('@') ? mJid : `${mJid.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
        try {
            await sock.groupParticipantsUpdate(gid, [mjid], 'demote');
            return `✅ *+${mjid.split('@')[0]}* ameshushwa kutoka admin`;
        } catch (e) {
            return `❌ Imeshindwa: ${e.message}`;
        }
    }

    // $groups add <groupJid> <number>
    if (sub === 'add') {
        const [gJid, mJid] = parts;
        if (!gJid || !mJid) return '❓ Format: $groups add <groupJid> <number>';
        const gid  = gJid.endsWith('@g.us') ? gJid : `${gJid}@g.us`;
        const mjid = mJid.includes('@') ? mJid : `${mJid.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
        try {
            await sock.groupParticipantsUpdate(gid, [mjid], 'add');
            return `✅ *+${mjid.split('@')[0]}* ameongezwa kwenye group`;
        } catch (e) {
            return `❌ Imeshindwa: ${e.message}`;
        }
    }

    return (
        `❓ *$groups matumizi:*\n\n` +
        `▸ \`$groups info <jid/jina>\` — taarifa za group\n` +
        `▸ \`$groups leave <groupJid>\` — toka group\n` +
        `▸ \`$groups kick <groupJid> <number>\` — fukuza mwanachama\n` +
        `▸ \`$groups promote <groupJid> <number>\` — fanya admin\n` +
        `▸ \`$groups demote <groupJid> <number>\` — ondoa admin\n` +
        `▸ \`$groups add <groupJid> <number>\` — ongeza mwanachama`
    );
}

// ════════════════════════════════════════════════
//   $MSG delete — Delete message by ID
// ════════════════════════════════════════════════
async function manageMsg(sock, from, subcommand, args) {
    const sub = (subcommand || '').toLowerCase().trim();

    if (sub === 'delete') {
        // args = "<messageId>" au "<jid> <messageId>"
        const parts = (args || '').trim().split(/\s+/);
        let targetJid, msgId;

        if (parts.length === 1) {
            // DM ya sasa — delete katika chat ya sasa
            targetJid = from;
            msgId     = parts[0];
        } else {
            targetJid = parts[0].includes('@') ? parts[0] : `${parts[0].replace(/[^0-9]/g,'')}@s.whatsapp.net`;
            msgId     = parts[1];
        }

        if (!msgId) return '❓ Format: $msg delete <messageId>\nau: $msg delete <jid> <messageId>';

        try {
            await sock.sendMessage(targetJid, {
                delete: {
                    remoteJid: targetJid,
                    fromMe:    true,
                    id:        msgId
                }
            });
            return `✅ Ujumbe *${msgId}* umefutwa`;
        } catch (e) {
            return `❌ Imeshindwa kufuta: ${e.message}`;
        }
    }

    return `❓ Format: $msg delete <messageId>`;
}

// ════════════════════════════════════════════════
//   $PROFILE — Profile picture + status
// ════════════════════════════════════════════════
async function getProfile(sock, from, number) {
    if (!number) return '❓ Format: $profile <number>\nMfano: $profile 255712345678';

    const clean = number.replace(/[^0-9]/g, '');
    const jid   = `${clean}@s.whatsapp.net`;

    try {
        // Profile picture
        let ppUrl = null;
        try {
            ppUrl = await sock.profilePictureUrl(jid, 'image');
        } catch { ppUrl = null; }

        // Status
        let status = null;
        try {
            const s = await sock.fetchStatus(jid);
            status = s?.status || null;
        } catch { status = null; }

        // WhatsApp check
        let exists = false;
        try {
            const result = await sock.onWhatsApp(clean);
            exists = result?.[0]?.exists || false;
        } catch {}

        let response = `*👤 Profile: +${clean}*\n\n`;
        response    += `WhatsApp: ${exists ? '✅ Ipo' : '❌ Haipo'}\n`;
        response    += `Status: ${status ? `_${status}_` : '(hakuna)'}\n`;
        response    += `Picha: ${ppUrl ? ppUrl : '(fiche au haipo)'}`;

        if (ppUrl) {
            try {
                // Tuma picha
                await sock.sendMessage(from, {
                    image:   { url: ppUrl },
                    caption: response
                });
                return null; // tayari imetumwa
            } catch {
                return response + '\n_(imeshindwa kupakua picha)_';
            }
        }

        return response;
    } catch (e) {
        return `❌ Imeshindwa: ${e.message}`;
    }
}

// ════════════════════════════════════════════════
//   $SETNAME / $SETSTATUS
// ════════════════════════════════════════════════
async function setBotName(sock, name) {
    if (!name) return '❓ Format: $setname <jina jipya>';
    try {
        await sock.updateProfileName(name);
        return `✅ Jina la bot limebadilishwa kuwa *${name}*`;
    } catch (e) {
        return `❌ Imeshindwa: ${e.message}`;
    }
}

async function setBotStatus(sock, status) {
    if (!status) return '❓ Format: $setstatus <maandishi>';
    try {
        await sock.updateProfileStatus(status);
        return `✅ Status imebadilishwa:\n_${status}_`;
    } catch (e) {
        return `❌ Imeshindwa: ${e.message}`;
    }
}

// ════════════════════════════════════════════════
//   $WHITELIST — Manage allowed numbers
// ════════════════════════════════════════════════
function manageWhitelist(subcommand, number) {
    const sub = (subcommand || 'list').toLowerCase().trim();

    if (sub === 'list') {
        if (global.evalWhitelist.size === 0) return '📭 Whitelist haina nambari.';
        const list = [...global.evalWhitelist].map((jid, i) =>
            `${i + 1}. *+${jid.split('@')[0]}*`
        ).join('\n');
        return `*✅ Whitelist (${global.evalWhitelist.size}):*\n\n${list}`;
    }

    if (sub === 'add') {
        if (!number) return '❓ Format: $whitelist add <number>';
        const clean = number.replace(/[^0-9]/g, '');
        const jid   = `${clean}@s.whatsapp.net`;
        global.evalWhitelist.add(jid);
        return `✅ *+${clean}* ameongezwa kwenye whitelist`;
    }

    if (sub === 'remove') {
        if (!number) return '❓ Format: $whitelist remove <number>';
        const clean = number.replace(/[^0-9]/g, '');
        const jid   = `${clean}@s.whatsapp.net`;
        if (!global.evalWhitelist.has(jid)) return `❌ *+${clean}* hayuko kwenye whitelist`;
        global.evalWhitelist.delete(jid);
        return `✅ *+${clean}* ameondolewa kwenye whitelist`;
    }

    if (sub === 'clear') {
        const count = global.evalWhitelist.size;
        global.evalWhitelist.clear();
        return `✅ Whitelist imefutwa (${count} nambari)`;
    }

    return `❓ Chaguzi:\n▸ \`$whitelist list\`\n▸ \`$whitelist add <number>\`\n▸ \`$whitelist remove <number>\`\n▸ \`$whitelist clear\``;
}

// ════════════════════════════════════════════════
//   $RATELIMIT — Rate limiting per command
// ════════════════════════════════════════════════
function manageRatelimit(subcommand, args) {
    const sub   = (subcommand || 'list').toLowerCase().trim();
    const parts = (args || '').trim().split(/\s+/);

    if (sub === 'list') {
        if (global.evalRateLimits.size === 0) return '📭 Hakuna rate limits zilizowekwa.';
        let out = `*⚡ RATE LIMITS (${global.evalRateLimits.size}):*\n\n`;
        for (const [cmd, cfg] of global.evalRateLimits.entries()) {
            out += `• *${cmd}:* ${cfg.maxCalls} calls / ${cfg.windowMs / 1000}s\n`;
        }
        return out.trim();
    }

    // $ratelimit set <command> <maxCalls> <windowSeconds>
    if (sub === 'set') {
        const [cmd, maxCalls, windowSecs] = parts;
        if (!cmd || !maxCalls || !windowSecs) {
            return '❓ Format: $ratelimit set <command> <maxCalls> <windowSeconds>\nMfano: $ratelimit set ai 5 60';
        }
        const max    = parseInt(maxCalls);
        const window = parseInt(windowSecs) * 1000;
        if (isNaN(max) || isNaN(window)) return '❌ maxCalls na windowSeconds lazima iwe nambari';
        global.evalRateLimits.set(cmd, { maxCalls: max, windowMs: window });
        return `✅ Rate limit imewekwa:\n*${cmd}:* max ${max} calls kila sekunde ${windowSecs}`;
    }

    // $ratelimit remove <command>
    if (sub === 'remove') {
        const cmd = parts[0];
        if (!cmd) return '❓ Format: $ratelimit remove <command>';
        if (!global.evalRateLimits.has(cmd)) return `❌ Rate limit ya *${cmd}* haipatikani`;
        global.evalRateLimits.delete(cmd);
        return `✅ Rate limit ya *${cmd}* imeondolewa`;
    }

    // $ratelimit clear
    if (sub === 'clear') {
        const count = global.evalRateLimits.size;
        global.evalRateLimits.clear();
        global.evalRateLimitCounters.clear();
        return `✅ Rate limits zote ${count} zimefutwa`;
    }

    return `❓ Chaguzi:\n▸ \`$ratelimit list\`\n▸ \`$ratelimit set <cmd> <max> <secs>\`\n▸ \`$ratelimit remove <cmd>\`\n▸ \`$ratelimit clear\``;
}

// ════════════════════════════════════════════════
//   $DB — Database queries + backup
// ════════════════════════════════════════════════
async function runDB(query) {
    try {
        const pool = global.dbPool;
        if (!pool) return '❌ Database pool haipatikani (global.dbPool)';

        const dangerous = /^\s*(DROP\s+(DATABASE|TABLE)|TRUNCATE|DELETE\s+FROM\s+\w+\s*;?\s*$)/i;
        if (dangerous.test(query)) {
            return '🛡️ *Query imezuiwa kwa usalama.*\nTumia WHERE clause kwa DELETE.';
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

async function dbBackup(sock, from) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return '❌ DATABASE_URL haipo kwenye ENV';

    // Jaribu kupata pg_dump
    const checkPg = await runTerminal('which pg_dump');
    if (checkPg.error) {
        return (
            `❌ *pg_dump haipatikani*\n\n` +
            `Kwenye Railway/Render pg_dump si available directly.\n` +
            `Njia mbadala:\n` +
            `• \`$db SELECT * FROM table\` kisha export manually\n` +
            `• Tumia Railway dashboard → Database → Backups\n` +
            `• Weka Railway CLI: \`railway db backup\``
        );
    }

    const timestamp  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupFile = path.join(os.tmpdir(), `backup_${timestamp}.sql`);

    await sock.sendMessage(from, { text: '💾 *Inaunda DB backup...*' });

    const { output, error } = await runTerminal(`pg_dump "${dbUrl}" -f "${backupFile}" 2>&1`);

    if (error && !fs.existsSync(backupFile)) {
        return `❌ Backup imeshindwa:\n\`\`\`\n${output}\n\`\`\``;
    }

    try {
        const stat    = fs.statSync(backupFile);
        const content = fs.readFileSync(backupFile);
        const fname   = `db_backup_${timestamp}.sql`;

        await sock.sendMessage(from, {
            document: content,
            fileName: fname,
            mimetype: 'text/plain',
            caption:  `✅ *DB Backup*\n📁 File: ${fname}\n📊 Size: ${formatBytes(stat.size)}\n🕐 ${new Date().toLocaleString('sw-TZ')}`
        });

        try { fs.unlinkSync(backupFile); } catch {}
        return null;
    } catch (e) {
        return `❌ Imeshindwa kutuma backup: ${e.message}`;
    }
}

// ════════════════════════════════════════════════
//   $FILE — Full file system management
// ════════════════════════════════════════════════
async function manageFile(sock, from, subcommand, args) {
    const sub   = (subcommand || '').toLowerCase().trim();
    const parts = (args || '').trim();

    // $file ls [path]
    if (sub === 'ls') {
        const dir = parts || process.cwd();
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            if (entries.length === 0) return `📭 Folder tupu: *${dir}*`;

            let out = `*📂 ${dir}*\n\n`;
            let dirs = 0, files = 0;
            for (const e of entries.slice(0, 50)) {
                if (e.isDirectory()) {
                    out  += `📁 ${e.name}/\n`;
                    dirs++;
                } else {
                    try {
                        const stat = fs.statSync(path.join(dir, e.name));
                        out  += `📄 ${e.name} _(${formatBytes(stat.size)})_\n`;
                    } catch {
                        out  += `📄 ${e.name}\n`;
                    }
                    files++;
                }
            }
            if (entries.length > 50) out += `\n...na ${entries.length - 50} zaidi`;
            out += `\n_Folders: ${dirs} | Files: ${files}_`;
            return out;
        } catch (e) {
            return `❌ Imeshindwa: ${e.message}`;
        }
    }

    // $file read <filepath>
    if (sub === 'read') {
        if (!parts) return '❓ Format: $file read <filepath>';
        try {
            const stat    = fs.statSync(parts);
            const maxSize = 50 * 1024; // 50KB
            if (stat.size > maxSize) {
                return `❌ File kubwa sana (${formatBytes(stat.size)}). Max: 50KB\nTumia: \`$ head -n 50 ${parts}\``;
            }
            const content = fs.readFileSync(parts, 'utf8');
            return `*📄 ${path.basename(parts)}* (${formatBytes(stat.size)})\n\`\`\`\n${truncate(content, 3000)}\n\`\`\``;
        } catch (e) {
            return `❌ Imeshindwa kusoma: ${e.message}`;
        }
    }

    // $file write <filepath> <content>
    if (sub === 'write') {
        const spaceIdx = parts.indexOf(' ');
        if (spaceIdx === -1) return '❓ Format: $file write <filepath> <content>';
        const filepath = parts.slice(0, spaceIdx).trim();
        const content  = parts.slice(spaceIdx + 1);
        try {
            // Hakikisha directory ipo
            fs.mkdirSync(path.dirname(filepath), { recursive: true });
            fs.writeFileSync(filepath, content, 'utf8');
            const stat = fs.statSync(filepath);
            return `✅ Imeandikwa: *${filepath}* (${formatBytes(stat.size)})`;
        } catch (e) {
            return `❌ Imeshindwa kuandika: ${e.message}`;
        }
    }

    // $file delete <filepath>
    if (sub === 'delete') {
        if (!parts) return '❓ Format: $file delete <filepath>';
        // Safety: kuzuia kufuta mfumo muhimu
        const DANGEROUS_PATHS = ['/', '/etc', '/usr', '/bin', '/sbin', '/var', process.cwd()];
        if (DANGEROUS_PATHS.some(dp => parts === dp)) {
            return `🛡️ Path *${parts}* imezuiwa kwa usalama`;
        }
        try {
            const stat = fs.statSync(parts);
            if (stat.isDirectory()) {
                fs.rmdirSync(parts, { recursive: true });
                return `✅ Folder imefutwa: *${parts}*`;
            } else {
                fs.unlinkSync(parts);
                return `✅ File imefutwa: *${parts}*`;
            }
        } catch (e) {
            return `❌ Imeshindwa kufuta: ${e.message}`;
        }
    }

    // $file stat <filepath>
    if (sub === 'stat') {
        if (!parts) return '❓ Format: $file stat <filepath>';
        try {
            const stat  = fs.statSync(parts);
            const isDir = stat.isDirectory();
            return (
                `*📊 File Stat: ${path.basename(parts)}*\n\n` +
                `Aina:     ${isDir ? 'Folder 📁' : 'File 📄'}\n` +
                `Ukubwa:   ${formatBytes(stat.size)}\n` +
                `Mode:     ${(stat.mode & 0o777).toString(8)}\n` +
                `Ilisomwa: ${stat.atime.toLocaleString('sw-TZ')}\n` +
                `Ilipind:  ${stat.mtime.toLocaleString('sw-TZ')}\n` +
                `Iliundwa: ${stat.ctime.toLocaleString('sw-TZ')}`
            );
        } catch (e) {
            return `❌ Imeshindwa: ${e.message}`;
        }
    }

    // $file send <filepath>
    if (sub === 'send') {
        if (!parts) return '❓ Format: $file send <filepath>';
        try {
            const stat = fs.statSync(parts);
            if (stat.size > 50 * 1024 * 1024) return `❌ File kubwa sana (${formatBytes(stat.size)}). Max: 50MB`;
            const content = fs.readFileSync(parts);
            const fname   = path.basename(parts);
            await sock.sendMessage(from, {
                document: content,
                fileName: fname,
                mimetype: 'application/octet-stream',
                caption:  `📁 *${fname}* (${formatBytes(stat.size)})`
            });
            return null;
        } catch (e) {
            return `❌ Imeshindwa kutuma: ${e.message}`;
        }
    }

    return (
        `❓ *$file matumizi:*\n\n` +
        `▸ \`$file ls [path]\` — orodha ya files\n` +
        `▸ \`$file read <path>\` — soma file\n` +
        `▸ \`$file write <path> <content>\` — andika file\n` +
        `▸ \`$file delete <path>\` — futa file/folder\n` +
        `▸ \`$file stat <path>\` — taarifa za file\n` +
        `▸ \`$file send <path>\` — tuma file kama document`
    );
}

// ════════════════════════════════════════════════
//   $NODE — Node.js diagnostics
// ════════════════════════════════════════════════
async function nodeInfo(subcommand) {
    const sub = (subcommand || 'info').toLowerCase().trim();

    if (sub === 'info') {
        const mem   = process.memoryUsage();
        const cpu   = process.cpuUsage();
        return (
            `*🟢 NODE.JS DIAGNOSTICS*\n\n` +
            `Version:      ${process.version}\n` +
            `V8 Engine:    ${process.versions.v8}\n` +
            `Platform:     ${process.platform} (${process.arch})\n` +
            `PID:          ${process.pid}\n` +
            `PPID:         ${process.ppid}\n` +
            `CWD:          ${process.cwd()}\n` +
            `Exec Path:    ${process.execPath}\n\n` +
            `*Memory:*\n` +
            `  Heap Used:  ${formatBytes(mem.heapUsed)}\n` +
            `  Heap Total: ${formatBytes(mem.heapTotal)}\n` +
            `  RSS:        ${formatBytes(mem.rss)}\n` +
            `  External:   ${formatBytes(mem.external)}\n\n` +
            `*CPU Usage:*\n` +
            `  User:   ${(cpu.user / 1000).toFixed(1)}ms\n` +
            `  System: ${(cpu.system / 1000).toFixed(1)}ms`
        );
    }

    if (sub === 'modules') {
        const mods = Object.keys(process.versions).sort();
        const out  = mods.map(m => `• *${m}:* ${process.versions[m]}`).join('\n');
        return `*📦 NODE VERSIONS:*\n\n${out}`;
    }

    if (sub === 'argv') {
        const args = process.argv.map((a, i) => `${i}: ${a}`).join('\n');
        return `*⌨️ PROCESS ARGV:*\n\`\`\`\n${args}\n\`\`\``;
    }

    if (sub === 'flags') {
        const flags = process.execArgv;
        if (!flags.length) return '📭 Hakuna Node.js flags zilizowekwa.';
        return `*🏴 NODE FLAGS:*\n${flags.map(f => `• ${f}`).join('\n')}`;
    }

    if (sub === 'loaded') {
        // Angalia modules zilizopakiwa (kwa CommonJS, require.cache)
        try {
            // Kwa ESM, tumia alternative
            const { output } = await runTerminal(`ls node_modules | head -30 2>/dev/null`);
            if (output && output.length > 5) {
                return `*📦 Node Modules (first 30):*\n\`\`\`\n${output}\n\`\`\``;
            }
        } catch {}
        return `*📦 NODE VERSIONS:*\n${Object.entries(process.versions).map(([k,v]) => `• ${k}: ${v}`).join('\n')}`;
    }

    return `❓ Chaguzi: info | modules | argv | flags | loaded`;
}

// ════════════════════════════════════════════════
//   $CONFIRM / $CANCEL — Confirmation system
// ════════════════════════════════════════════════
function registerConfirm(from, description, action, timeoutMs = 30000) {
    // Futa ya zamani kama ipo
    const existing = global.evalPendingConfirm.get(from);
    if (existing) clearTimeout(existing.timeoutId);

    const timeoutId = setTimeout(() => {
        global.evalPendingConfirm.delete(from);
    }, timeoutMs);

    global.evalPendingConfirm.set(from, { description, action, timeoutId });

    return (
        `⚠️ *Thibitisho Inahitajika*\n\n` +
        `*Hatua:* ${description}\n\n` +
        `Andika \`.eval $confirm\` kuthibitisha\n` +
        `au \`.eval $cancel\` kughairi\n\n` +
        `_(Itatoweka baada ya sekunde 30)_`
    );
}

async function executeConfirm(from) {
    const pending = global.evalPendingConfirm.get(from);
    if (!pending) return '❌ Hakuna hatua inayongoja uthibitisho.';
    clearTimeout(pending.timeoutId);
    global.evalPendingConfirm.delete(from);
    try {
        const result = await pending.action();
        return result || `✅ Hatua imetekelezwa: *${pending.description}*`;
    } catch (e) {
        return `❌ Hatua imeshindwa: ${e.message}`;
    }
}

function cancelConfirm(from) {
    const pending = global.evalPendingConfirm.get(from);
    if (!pending) return '❌ Hakuna hatua inayongoja kughairiwa.';
    clearTimeout(pending.timeoutId);
    global.evalPendingConfirm.delete(from);
    return `✅ Hatua *${pending.description}* imeghairiwa.`;
}

// ════════════════════════════════════════════════
//   $STATE — Bot inspection
// ════════════════════════════════════════════════
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

// ════════════════════════════════════════════════
//   $AI — AI memory management
// ════════════════════════════════════════════════
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

// ════════════════════════════════════════════════
//   $SESSIONS — DB sessions
// ════════════════════════════════════════════════
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

// ════════════════════════════════════════════════
//   $GC — Garbage Collection
// ════════════════════════════════════════════════
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

// ════════════════════════════════════════════════
//   $PERF — Performance profiling
// ════════════════════════════════════════════════
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

// ════════════════════════════════════════════════
//   $ENV — Runtime env management
// ════════════════════════════════════════════════
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

// ════════════════════════════════════════════════
//   $SEND — Tuma ujumbe kwa mtu yeyote
// ════════════════════════════════════════════════
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

// ════════════════════════════════════════════════
//   $BROADCAST — Broadcast haraka
// ════════════════════════════════════════════════
async function quickBroadcast(sock, text) {
    if (!text) return '❓ Format: $broadcast <ujumbe>';

    let groups;
    try {
        groups = await sock.groupFetchAllParticipating();
    } catch (e) {
        return `❌ Imeshindwa kupata groups: ${e.message}`;
    }

    const ids  = Object.keys(groups);
    let sent   = 0;
    let failed = 0;

    for (const id of ids) {
        try {
            await new Promise(r => setTimeout(r, 1000));
            await sock.sendMessage(id, { text: `📡 *26-TECH*\n\n${text}` });
            sent++;
        } catch { failed++; }
    }

    return `✅ *Broadcast Imekamilika*\n\n✔️ Sent: ${sent}\n❌ Failed: ${failed}\n📊 Total: ${ids.length}`;
}

// ════════════════════════════════════════════════
//   $BAN / $UNBAN
// ════════════════════════════════════════════════
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

const getMainOwnerJid = () => {
    const owners = getOwnersList();
    return owners[0] || `${(process.env.OWNER_NUMBER || '').split(',')[0].replace(/[^0-9]/g, '')}@s.whatsapp.net`;
};

// ════════════════════════════════════════════════
//   $PING — Test connection
// ════════════════════════════════════════════════
async function pingTarget(sock, target) {
    if (!target) {
        const start = Date.now();
        try {
            await sock.sendPresenceUpdate('available', getMainOwnerJid());
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

// ════════════════════════════════════════════════
//   $RESTART — Restart bot
// ════════════════════════════════════════════════
async function restartBot(sock, from) {
    await sock.sendMessage(from, {
        text: '🔄 *Bot inarestart...*\n_Itarudi baada ya sekunde chache._'
    });
    setTimeout(() => process.exit(0), 2000);
    return null;
}

// ════════════════════════════════════════════════
//   $UPDATE — Smart update (Railway / Render / VPS)
// ════════════════════════════════════════════════
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
                `Pata deploy hook kwenye:\n` +
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
        `Environment haikutambuliwa.\n` +
        `Weka moja ya hizi kwenye ENV:\n` +
        `• \`RAILWAY_TOKEN\` — kwa Railway\n` +
        `• \`RENDER_DEPLOY_HOOK\` — kwa Render`
    );
}

// ════════════════════════════════════════════════
//   $LOGS — Bot logs za mwisho
// ════════════════════════════════════════════════
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

// ════════════════════════════════════════════════
//   $EXPORT — Export historia
// ════════════════════════════════════════════════
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

// ════════════════════════════════════════════════
//   HELP MESSAGE (updated)
// ════════════════════════════════════════════════
function getHelp() {
    return (
        `*⚡ 26-TECH PRO EVAL v2*\n\n` +
        `*📝 JS Eval:*\n` +
        `▸ \`.eval <code>\` — JS code\n` +
        `▸ \`.eval $perf <code>\` — Performance test\n\n` +
        `*💻 Terminal:*\n` +
        `▸ \`.eval $ <cmd>\` — Terminal command\n` +
        `▸ \`.eval $logs\` — Bot logs\n` +
        `▸ \`.eval $restart\` — Restart bot\n` +
        `▸ \`.eval $update\` — Git pull + restart\n\n` +
        `*📊 State & Diagnostics:*\n` +
        `▸ \`.eval $state [all/groups/commands/memory/cache/env/socket/disk/net]\`\n` +
        `▸ \`.eval $uptime\` — Uptime + wakati wa kuanza\n` +
        `▸ \`.eval $node [info/modules/argv/flags/loaded]\` — Node diagnostics\n\n` +
        `*🗄️ Database:*\n` +
        `▸ \`.eval $db <SQL>\` — SQL query\n` +
        `▸ \`.eval $db backup\` — pg_dump backup\n` +
        `▸ \`.eval $sessions [list/count]\` — Sessions\n\n` +
        `*🧠 AI Memory:*\n` +
        `▸ \`.eval $ai list|stats|clear <num>|clearall\`\n\n` +
        `*📡 Network:*\n` +
        `▸ \`.eval $ping [number]\` — Ping\n` +
        `▸ \`.eval $send <num> <msg>\` — Tuma ujumbe\n` +
        `▸ \`.eval $broadcast <msg>\` — Broadcast\n\n` +
        `*👥 Groups:*\n` +
        `▸ \`.eval $groups info|leave|kick|promote|demote|add\`\n\n` +
        `*🧑 Profile:*\n` +
        `▸ \`.eval $profile <number>\` — Picha + status\n` +
        `▸ \`.eval $setname <jina>\` — Badilisha jina bot\n` +
        `▸ \`.eval $setstatus <text>\` — Badilisha bio\n\n` +
        `*🔧 System:*\n` +
        `▸ \`.eval $ban <num>\` / \`$unban <num>\`\n` +
        `▸ \`.eval $block list\` — Blocked numbers\n` +
        `▸ \`.eval $kill <pid> [signal]\` — Kill process\n` +
        `▸ \`.eval $gc\` — Garbage collection\n` +
        `▸ \`.eval $env list|get|set\` — ENV management\n\n` +
        `*📁 Files:*\n` +
        `▸ \`.eval $file ls|read|write|delete|stat|send\`\n\n` +
        `*⏰ Scheduling:*\n` +
        `▸ \`.eval $cron list|start|stop|stopall\`\n\n` +
        `*📦 Cache:*\n` +
        `▸ \`.eval $cache [clear <all/messages/contacts/history>]\`\n\n` +
        `*⚡ Rate Limits:*\n` +
        `▸ \`.eval $ratelimit list|set|remove|clear\`\n\n` +
        `*✅ Whitelist:*\n` +
        `▸ \`.eval $whitelist list|add|remove|clear\`\n\n` +
        `*🗑️ Messages:*\n` +
        `▸ \`.eval $msg delete <id>\` — Futa ujumbe\n\n` +
        `*✔️ Confirm:*\n` +
        `▸ \`.eval $confirm\` — Thibitisha hatua\n` +
        `▸ \`.eval $cancel\` — Ghairi hatua\n\n` +
        `*📋 History:*\n` +
        `▸ \`.eval $history\` — Historia\n` +
        `▸ \`.eval $export\` — Export historia\n` +
        `▸ \`.eval $clear\` — Futa historia`
    );
}

// ════════════════════════════════════════════════
//   MAIN EXPORTS
// ════════════════════════════════════════════════
export const name        = 'eval';
export const description = 'Pro Grade Eval v2 — JS, Terminal, DB, State, AI memory, Groups, Files, Cron na zaidi';
export const category    = 'owner';
export const use         = '<code> | $ <cmd> | $state | $db | $ai | $send | ...';
export const alias       = ['ev', 'exec'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;

    console.log('\n⚡ [EVAL] execute() imeitwa!');
    console.log('  from:', from);

    // ── Owner check (kutoka .env OWNER_NUMBER) ──
    const isGroup_exec = msg.key.remoteJid?.endsWith('@g.us');
    const senderJid_exec = isGroup_exec
        ? (msg.key.participant || '')
        : (msg.key.fromMe ? '' : (msg.key.remoteJid || ''));
    console.log('  [EVAL] senderJid:', senderJid_exec);
    console.log('  [EVAL] sock.user.lid:', sock?.user?.lid);
    console.log('  [EVAL] OWNER_NUMBER env:', process.env.OWNER_NUMBER);

    if (!isOwner(msg, sock)) {
        console.log('❌ [EVAL] isOwner = false — inarejea bila kujibu');
        return;
    }
    console.log('✅ [EVAL] isOwner = true — inaendelea...');

    // ── DM tu ──
    if (from.endsWith('@g.us')) {
        return sock.sendMessage(from, {
            text: '⚠️ _Eval inafanya kazi kwenye DM tu._'
        }, { quoted: msg });
    }

    // ── Pata full text (support multi-line code blocks) ──
    const fullText = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text || ''
    ).trim();

    // Ondoa prefix (.eval / .ev / .exec)
    let text = fullText.replace(/^\.(eval|ev|exec)\s*/i, '').trim();

    // Support code blocks ```...```
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

        // ── $help ──
        if (/^\$help$/i.test(text)) {
            return reply(getHelp());
        }

        // ── $confirm ──
        if (/^\$confirm$/i.test(text)) {
            return reply(await executeConfirm(from));
        }

        // ── $cancel ──
        if (/^\$cancel$/i.test(text)) {
            return reply(cancelConfirm(from));
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
            // Tumia confirm system kwa hatua kubwa
            return reply(registerConfirm(from, 'Restart bot', () => restartBot(sock, from)));
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
            const broadText = text.replace(/^\$broadcast\s*/i, '').trim();
            if (!broadText) return reply('❓ Format: $broadcast <ujumbe>');
            return reply(registerConfirm(from, `Broadcast kwa groups zote: "${broadText.slice(0, 50)}"`,
                () => quickBroadcast(sock, broadText)
            ));
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

        // ── $kill <pid> [signal] ──
        if (/^\$kill\s+/i.test(text)) {
            const parts  = text.replace(/^\$kill\s+/i, '').trim().split(/\s+/);
            const pid    = parts[0];
            const signal = parts[1] || 'SIGTERM';
            return reply(killProcess(pid, signal));
        }

        // ── $cron <sub> [args] ──
        if (/^\$cron/i.test(text)) {
            const rest = text.replace(/^\$cron\s*/i, '').trim();
            const parts = rest.split(/\s+/);
            const sub   = parts[0];
            const args2 = parts.slice(1).join(' ');
            return reply(await manageCron(sub, args2, sock, from));
        }

        // ── $cache [clear <target>] ──
        if (/^\$cache/i.test(text)) {
            const target = text.replace(/^\$cache\s*/i, '').trim();
            return reply(manageCache(target));
        }

        // ── $block list ──
        if (/^\$block/i.test(text)) {
            const sub = text.replace(/^\$block\s*/i, '').trim() || 'list';
            return reply(await manageBlock(sock, sub));
        }

        // ── $groups <sub> [args] ──
        if (/^\$groups/i.test(text)) {
            const rest  = text.replace(/^\$groups\s*/i, '').trim();
            const parts = rest.split(/\s+/);
            const sub   = parts[0];
            const args2 = parts.slice(1).join(' ');
            return reply(await manageGroups(sock, sub, args2));
        }

        // ── $msg delete <id> ──
        if (/^\$msg/i.test(text)) {
            const rest  = text.replace(/^\$msg\s*/i, '').trim();
            const parts = rest.split(/\s+/);
            const sub   = parts[0];
            const args2 = parts.slice(1).join(' ');
            return reply(await manageMsg(sock, from, sub, args2));
        }

        // ── $profile <number> ──
        if (/^\$profile\s+/i.test(text)) {
            const number = text.replace(/^\$profile\s+/i, '').trim();
            return reply(await getProfile(sock, from, number));
        }

        // ── $setname <name> ──
        if (/^\$setname\s*/i.test(text)) {
            const name = text.replace(/^\$setname\s*/i, '').trim();
            return reply(await setBotName(sock, name));
        }

        // ── $setstatus <text> ──
        if (/^\$setstatus\s*/i.test(text)) {
            const status = text.replace(/^\$setstatus\s*/i, '').trim();
            return reply(await setBotStatus(sock, status));
        }

        // ── $whitelist <sub> [number] ──
        if (/^\$whitelist/i.test(text)) {
            const parts  = text.replace(/^\$whitelist\s*/i, '').trim().split(/\s+/);
            const sub    = parts[0];
            const number = parts[1];
            return reply(manageWhitelist(sub, number));
        }

        // ── $ratelimit <sub> [args] ──
        if (/^\$ratelimit/i.test(text)) {
            const rest  = text.replace(/^\$ratelimit\s*/i, '').trim();
            const parts = rest.split(/\s+/);
            const sub   = parts[0];
            const args2 = parts.slice(1).join(' ');
            return reply(manageRatelimit(sub, args2));
        }

        // ── $db backup ──
        if (/^\$db\s+backup$/i.test(text)) {
            const res = await dbBackup(sock, from);
            return res ? reply(res) : undefined;
        }

        // ── $db <SQL> ──
        if (/^\$db\s+/i.test(text)) {
            const sql = text.replace(/^\$db\s+/i, '').trim();
            const res = await runDB(sql);
            addToHistory('$db', sql.slice(0, 60), res, Date.now() - start);
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

        // ── $state [query] ──
        if (/^\$state/i.test(text)) {
            const query = text.replace(/^\$state\s*/i, '').trim() || 'all';
            return reply(await getBotState(sock, query));
        }

        // ── $node <sub> ──
        if (/^\$node/i.test(text)) {
            const sub = text.replace(/^\$node\s*/i, '').trim() || 'info';
            return reply(await nodeInfo(sub));
        }

        // ── $file <sub> [args] ──
        if (/^\$file/i.test(text)) {
            const rest  = text.replace(/^\$file\s*/i, '').trim();
            const parts = rest.split(/\s+/);
            const sub   = parts[0];
            const args2 = parts.slice(1).join(' ');
            return reply(await manageFile(sock, from, sub, args2));
        }

        // ── $perf <code> ──
        if (/^\$perf\s+/i.test(text)) {
            const code = text.replace(/^\$perf\s+/i, '').trim();
            return reply(await runPerf(code, { sock, msg, from }));
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
