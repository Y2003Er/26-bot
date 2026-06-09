// session-db.js – Toleo la Ulinzi dhidi ya Bot Kuganda (Memory Leak Fix)
import { Pool } from 'pg';
import pino from 'pino';
import { initAuthCreds, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';

const logger = pino({ level: 'silent' });
let pool = null;

function getPool() {
    if (pool) return pool;
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL missing');
    pool = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false },
        max: 10, // Tumeongeza connection pool kufungua njia
        connectionTimeoutMillis: 30000,
    });
    pool.on('error', (err) => console.error('[DB] Pool error:', err.message));
    return pool;
}

function reviveBuffers(obj) {
    if (obj == null) return obj;
    if (typeof obj === 'string') return obj;
    if (Array.isArray(obj)) return obj.map(reviveBuffers);
    if (typeof obj === 'object') {
        if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
            return Buffer.from(obj.data);
        }
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = reviveBuffers(value);
        }
        return result;
    }
    return obj;
}

function replacer(key, value) {
    if (Buffer.isBuffer(value)) {
        return { type: 'Buffer', data: [...value] };
    }
    return value;
}

export async function initializeDatabase() {
    const client = await getPool().connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS wa_sessions (
                session_id TEXT PRIMARY KEY,
                state JSONB NOT NULL,
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        console.log('[session-db] Table "wa_sessions" ipo tayari kabisa.');
        return true;
    } catch (err) {
        console.error('[session-db] Table error:', err.message);
        return false;
    } finally {
        client.release();
    }
}

async function loadState(sessionId) {
    const client = await getPool().connect();
    try {
        const res = await client.query(
            `SELECT state FROM wa_sessions WHERE session_id = $1`,
            [sessionId]
        );
        if (res.rows.length === 0) return null;
        return res.rows[0].state;
    } catch (err) {
        return null;
    } finally {
        client.release();
    }
}

async function saveState(sessionId, stateData) {
    const client = await getPool().connect();
    try {
        const serialized = JSON.parse(JSON.stringify(stateData, replacer));
        await client.query(
            `INSERT INTO wa_sessions (session_id, state, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (session_id) DO UPDATE
             SET state = EXCLUDED.state, updated_at = NOW()`,
            [sessionId, serialized]
        );
    } catch (err) {
        console.error('[session-db] DB Save error:', err.message);
    } finally {
        client.release();
    }
}

export async function deleteAllSessions() {
    const client = await getPool().connect();
    try {
        await client.query(`DELETE FROM wa_sessions`);
    } catch (err) {} finally { client.release(); }
}

export async function usePostgresAuthState(sessionId) {
    const fullState = await loadState(sessionId);

    const creds = reviveBuffers(fullState?.creds) || initAuthCreds();
    // 💡 MUHIMU: Tunapakia keys za zamani kama zipo, lakini hatutaruhusu pre-keys zizibe DB
    let keysStore = reviveBuffers(fullState?.keys) || {};

    const keyStore = {
        get: async (type, ids) => {
            const result = {};
            for (const id of ids) {
                const val = keysStore[`${type}--${id}`];
                if (val !== undefined) result[id] = val;
            }
            return result;
        },
        set: async (data) => {
            let shouldSaveToDB = false;

            for (const [type, entries] of Object.entries(data)) {
                if (!entries) continue;
                
                // 🚫 KANUNI YA DHAHABU: Zuia pre-keys na session-keys zisijaze database na kugandisha bot
                if (type === 'pre-key' || type === 'session' || type === 'app-state-sync-key') {
                    for (const [id, value] of Object.entries(entries)) {
                        const key = `${type}--${id}`;
                        if (value == null) delete keysStore[key];
                        else keysStore[key] = value;
                    }
                    continue; // Hifadhi kwenye RAM pekee, usiende kwenye database!
                }

                // Vitu vya msingi (kama sender-key ya vikundi au identity) vinaruhusiwa kwenda kwenye DB
                for (const [id, value] of Object.entries(entries)) {
                    const key = `${type}--${id}`;
                    if (value == null) {
                        if (keysStore[key] !== undefined) {
                            delete keysStore[key];
                            shouldSaveToDB = true;
                        }
                    } else {
                        keysStore[key] = value;
                        shouldSaveToDB = true;
                    }
                }
            }

            // Save kwenye database pale tu vitu muhimu vya muunganisho vinapobadilika
            if (shouldSaveToDB) {
                await saveState(sessionId, { creds, keys: keysStore });
            }
        },
    };

    const keys = makeCacheableSignalKeyStore(keyStore, logger);

    const saveCreds = async (update) => {
        if (update && typeof update === 'object') {
            Object.assign(creds, update);
        }
        await saveState(sessionId, { creds, keys: keysStore });
    };

    return { state: { creds, keys }, saveCreds };
}
