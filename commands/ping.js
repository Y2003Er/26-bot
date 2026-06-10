/**
 * commands/ping.js
 * Angalia kama bot iko hai + latency
 */

export const name        = 'ping';
export const description = 'Angalia kama bot iko hai na latency yake';
export const category    = 'general';
export const use         = '';
export const alias       = ['alive', 'test'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const from  = msg.key.remoteJid;
    const start = Date.now();

    await sock.sendMessage(from, {
        text: '🏓 Pong!'
    }, { quoted: msg });

    const latency = Date.now() - start;

    await sock.sendMessage(from, {
        text:
            `╔═══════════════════╗\n` +
            `║  🤖 *26-TECH BOT* ║\n` +
            `╚═══════════════════╝\n\n` +
            `✅ *Status:* Online\n` +
            `⚡ *Latency:* ${latency}ms\n` +
            `🕐 *Wakati:* ${new Date().toLocaleTimeString('sw-TZ')}\n` +
            `💾 *RAM:* ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB`
    }, { quoted: msg });
}
