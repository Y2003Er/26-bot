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
 * ─────────────────────────────────────────────────────────────
 */

import { exec }    from 'child_process';
import util        from 'util';
import os          from 'os';
import fs          from 'fs';
import path        from 'path';

// ── Owner check (Maboresho ya Multi-owner Support) ──
const OWNERS_LIST = (process.env.OWNER_NUMBER || '')
    .split(',')
    .map(num => `${num.replace(/[^0-9]/g, '')}@s.whatsapp.net`)
    .filter(jid => jid !== '@s.whatsapp.net');

function normalizeJid(jid) {
    if (!jid) return '';
    return jid.split(':')[0].split('@')[0] + '@s.whatsapp.net';
}

function isOwner(msg) {
    const isGroup  = msg.key.remoteJid?.endsWith('@g.us');
    const isFromMe = msg.key.fromMe === true;
    const sender   = normalizeJid(isGroup ? (msg.key.participant || '') : msg.key.remoteJid);
    return OWNERS_LIST.includes(sender) || (isGroup && isFromMe);
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
//   $DB — Database queries
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

const MAIN_OWNER_JID = OWNERS_LIST[0] || `${(process.env.OWNER_NUMBER || '').split(',')[0].replace(/[^0-9]/g, '')}@s.whatsapp.net`;

// ════════════════════════════════════════════════
//   $PING — Test connection
// ════════════════════════════════════════════════
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
//   $UPDATE — Pull GitHub + restart
// ════════════════════════════════════════════════
async function updateBot(sock, from) {
    await sock.sendMessage(from, {
        text: '⬆️ *Inafetch updates kutoka GitHub...*'
    });

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
//   HELP MESSAGE
// ════════════════════════════════════════════════
function getHelp() {
    return (
        `*⚡ 26-TECH PRO EVAL*\n\n` +
        `*📝 JS Eval:*\n` +
        `▸ \`.eval <code>\` — JS code\n` +
        `▸ \`.eval $perf <code>\` — Performance test\n\n` +
        `*💻 Terminal:*\n` +
        `▸ \`.eval $ <cmd>\` — Terminal command\n` +
        `▸ \`.eval $logs\` — Bot logs\n` +
        `▸ \`.eval $restart\` — Restart bot\n` +
        `▸ \`.eval $update\` — Git pull + restart\n\n` +
        `*📊 State:*\n` +
        `▸ \`.eval $state\` — Hali yote\n` +
        `▸ \`.eval $state groups|commands|memory|cache|env|socket|disk|net\`\n\n` +
        `*🗄️ Database:*\n` +
        `▸ \`.eval $db <SQL>\` — SQL query\n` +
        `▸ \`.eval $sessions\` — Sessions\n\n` +
        `*🧠 AI Memory:*\n` +
        `▸ \`.eval $ai list|stats|clear <num>|clearall\`\n\n` +
        `*📡 Network:*\n` +
        `▸ \`.eval $ping [number]\` — Ping\n` +
        `▸ \`.eval $send <num> <msg>\` — Tuma ujumbe\n` +
        `▸ \`.eval $broadcast <msg>\` — Broadcast\n\n` +
        `*🔧 System:*\n` +
        `▸ \`.eval $ban <num>\` — Block number\n` +
        `▸ \`.eval $unban <num>\` — Unblock number\n` +
        `▸ \`.eval $gc\` — Garbage collection\n` +
        `▸ \`.eval $env list|get|set\` — ENV management\n\n` +
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
export const description = 'Pro Grade Eval — JS, Terminal, DB, State, AI memory na zaidi';
export const category    = 'owner';
export const use         = '<code> | $ <cmd> | $state | $db | $ai | $send | ...';
export const alias       = ['ev', 'exec'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;

    // ── Owner peke yake ──
    if (!isOwner(msg)) return;

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

        // ── $restart ──
        if (/^\$restart$/i.test(text)) {
            const res = await restartBot(sock, from);
            return res ? reply(res) : undefined;
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
            const msg2 = text.replace(/^\$broadcast\s*/i, '').trim();
            return reply(await quickBroadcast(sock, msg2));
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

        // ── $state [query] ──
        if (/^\$state/i.test(text)) {
            const query = text.replace(/^\$state\s*/i, '').trim() || 'all';
            return reply(await getBotState(sock, query));
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

        const result  = await runEval(text, { sock, msg, from });
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
