// commands/ping.js
// ════════════════════════════════════════════════════════════════
//   Ping command — inaonyesha latency ya bot + uptime + RAM
// ════════════════════════════════════════════════════════════════

import os from 'os';

export const name        = 'ping';
export const description = 'Angalia kama bot ipo online + latency';
export const category    = 'general';
export const alias       = ['speed', 'alive'];

export async function execute(sock, msg, args) {
    const from  = msg.key.remoteJid;
    const start = Date.now();

    // Tuma ujumbe wa kwanza kupima latency
    const sent = await sock.sendMessage(from, {
        text: '🏓 Pinging...'
    }, { quoted: msg });

    const latency = Date.now() - start;

    // RAM
    const usedMB  = ((os.totalmem() - os.freemem()) / 1024 / 1024).toFixed(0);
    const totalMB = (os.totalmem() / 1024 / 1024).toFixed(0);

    // Uptime
    const uptimeSec = Math.floor(process.uptime());
    const h = Math.floor(uptimeSec / 3600);
    const m = Math.floor((uptimeSec % 3600) / 60);
    const s = uptimeSec % 60;
    const uptime = h > 0 ? `${h}h ${m}m ${s}s`
                 : m > 0 ? `${m}m ${s}s`
                 : `${s}s`;

    // Speed rating
    const rating = latency < 300  ? '🟢 Haraka sana'
                 : latency < 700  ? '🟡 Wastani'
                 : latency < 1500 ? '🟠 Polepole kidogo'
                 :                  '🔴 Polepole sana';

    const text = `╔══════════════════════╗\n` +
                 `║  🤖 *26-TECH BOT*    ║\n` +
                 `╚══════════════════════╝\n\n` +
                 `🏓 *Pong!*\n\n` +
                 `⚡ *Latency:* ${latency}ms\n` +
                 `${rating}\n\n` +
                 `🕐 *Uptime:* ${uptime}\n` +
                 `💾 *RAM:* ${usedMB}/${totalMB} MB\n` +
                 `📡 *Status:* Online ✅\n\n` +
                 `_⚡ Powered by 26-𝚃𝙴𝙲𝙷_`;

    // Edit ujumbe wa kwanza na jibu kamili
    await sock.sendMessage(from, { text }, { quoted: msg });
}
