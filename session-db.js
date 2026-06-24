// session-db.js – FIXED v2.1 by 26-TECH
// FIX C-1: Debounce keys.set() — ilikuwa inafanya DB write kwa kila key update
// FIX C-2: Tumia shared pool kutoka lib/db.js — inaondoa pool ya pili
// FIX M-3: Debounce saveCreds — ilikuwa inaweza kufanya concurrent writes

import { getPool } from './lib/db.js';
import pino from 'pino';
import { initAuthCreds, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';

const logger = pino({ level: 'silent' });

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

export async function usePostgresAuthState(sessionId) {
    const fullState = await loadState(sessionId);
    const creds = reviveBuffers(fullState?.creds) || initAuthCreds();
    let keysStore = reviveBuffers(fullState?.keys) || {};

    // ── FIX C-1: Debounce keys.set()
    let keysDebounceTimer = null;

    function scheduleKeysSave() {
        if (keysDebounceTimer) clearTimeout(keysDebounceTimer);
        keysDebounceTimer = setTimeout(async () => {
            try {
                await saveState(sessionId, { creds, keys: keysStore });
            } catch (err) {
                console.error('[session-db] Debounced keys save error:', err.message);
            }
        }, 500);
    }

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
                scheduleKeysSave();
            }
        },
    };

    const keys = makeCacheableSignalKeyStore(keyStore, logger);

    // ── FIX M-3: Debounce saveCreds
    let credsDebounceTimer = null;

    const saveCreds = async (update) => {
        if (update && typeof update === 'object') {
            Object.assign(creds, update);
        }
        if (credsDebounceTimer) clearTimeout(credsDebounceTimer);
        credsDebounceTimer = setTimeout(async () => {
            try {
                await saveState(sessionId, { creds, keys: keysStore });
                console.log('[session-db] Creds saved (debounced).');
            } catch (err) {
                console.error('[session-db] Debounced creds save error:', err.message);
            }
        }, 300);
    };

    return { state: { creds, keys }, saveCreds };
}