// session-db.js – inahifadhi state nzima kwenye safu ya 'state' (JSONB)
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
        max: 5,
        connectionTimeoutMillis: 30000,
    });
    pool.on('error', (err) => console.error('[DB] Pool error:', err.message));
    return pool;
}

// ✅ Rejesha Buffer kutoka Base64 string au { type:'Buffer', data:[...] }
function reviveBuffers(obj) {
    if (obj == null) return obj;

    if (typeof obj === 'string') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(reviveBuffers);
    }

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

// ✅ Badilisha Buffer kuwa Base64 kabla ya kuhifadhi kwenye JSONB
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
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_name = 'wa_sessions'
                ) AND NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'wa_sessions' AND column_name = 'state'
                ) THEN
                    DROP TABLE wa_sessions;
                    RAISE NOTICE 'wa_sessions (schema ya zamani) imefutwa — itaundwa upya.';
                END IF;
            END $$;
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS wa_sessions (
                session_id TEXT PRIMARY KEY,
                state JSONB NOT NULL,
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        console.log('[session-db] Table "wa_sessions" ready (state JSONB).');
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
        console.error('[session-db] Load error:', err.message);
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
        console.error('[session-db] Save error:', err.message);
    } finally {
        client.release();
    }
}

export async function deleteSession(sessionId) {
    const client = await getPool().connect();
    try {
        await client.query(`DELETE FROM wa_sessions WHERE session_id = $1`, [sessionId]);
        console.log(`[session-db] Session ${sessionId} deleted`);
    } catch (err) {
        console.error('[session-db] Delete error:', err.message);
    } finally {
        client.release();
    }
}

export async function deleteAllSessions() {
    const client = await getPool().connect();
    try {
        const result = await client.query(`DELETE FROM wa_sessions`);
        console.log(`[session-db] Deleted ${result.rowCount} session(s).`);
    } catch (err) {
        console.error('[session-db] Delete all error:', err.message);
    } finally {
        client.release();
    }
}

// ✅ Main auth state kwa Baileys v7 yenye DEBOUNCE CACHE ya Keys kulinda DB
export async function usePostgresAuthState(sessionId) {
    const fullState = await loadState(sessionId);

    const creds = reviveBuffers(fullState?.creds) || initAuthCreds();
    let keysStore = reviveBuffers(fullState?.keys) || {};

    // 🕒 Kichapuzi cha DB: Huwa kinakusanya Keys zote zinazokuja kwa sekunde hiyo na kuzisave pamoja
    let saveTimeout = null;
    const scheduleSave = () => {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            await saveState(sessionId, { creds, keys: keysStore });
        }, 2000); // Subiri sekunde 2 mfululizo kabla ya kugusa DB
    };

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
            let changed = false;
            for (const [type, entries] of Object.entries(data)) {
                if (!entries) continue;
                for (const [id, value] of Object.entries(entries)) {
                    const key = `${type}--${id}`;
                    if (value == null) {
                        if (keysStore[key] !== undefined) {
                            delete keysStore[key];
                            changed = true;
                        }
                    } else {
                        keysStore[key] = value;
                        changed = true;
                    }
                }
            }
            if (changed) {
                scheduleSave(); // ✅ Tumia schedule ya ulinzi badala ya kupiga DB direct kila sekunde
            }
        },
    };

    const keys = makeCacheableSignalKeyStore(keyStore, logger);

    const saveCreds = async (update) => {
        if (update && typeof update === 'object') {
            Object.assign(creds, update);
        }
        // Creds bado zinasave papo hapo kwa usalama wa session
        await saveState(sessionId, { creds, keys: keysStore });
        console.log('[session-db] Creds updated & saved.');
    };

    const state = { creds, keys };

    return { state, saveCreds };
}
