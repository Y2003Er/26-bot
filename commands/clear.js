'use strict';

import { Pool } from 'pg';

// Reuse singleton pool
global.dbPool ||= new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});
const pool = global.dbPool;

// ════════════════════════════════════════════════
//   🗑️ CLEAR COMMAND — Safisha kumbukumbu ya mtumiaji
// ════════════════════════════════════════════════
export const name        = 'clear';
export const description = 'Safisha kumbukumbu ya mazungumzo na AI';
export const category    = 'ai';
export const alias       = ['reset', 'forget'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const from   = msg.key.remoteJid;
    const sender = msg.key.participant || from;

    try {
        const result = await pool.query(
            'DELETE FROM ai_memory WHERE user_id = $1', [sender]
        );

        const imiDeleted = result.rowCount > 0;

        if (imiDeleted) {
            await sock.sendMessage(from, {
                text: '🗑️ *Kumbukumbu imesafishwa!*\n\n' +
                      'Mazungumzo yetu yote yamefutwa. ' +
                      'Ninaanza upya kama tunaonana kwa mara ya kwanza. 👋'
            }, { quoted: msg });
        } else {
            await sock.sendMessage(from, {
                text: '🤷 *Hakuna kumbukumbu ya kufuta.*\n\n' +
                      'Bado hatujaongea au umeshafuta awali. Anza tu! 💬'
            }, { quoted: msg });
        }

    } catch (err) {
        await sock.sendMessage(from, {
            text: `❌ Imeshindwa kusafisha kumbukumbu: ${err.message}`
        }, { quoted: msg });
    }

    return true;
}
