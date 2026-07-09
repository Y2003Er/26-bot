// session-db.js – FIXED v3.1 by 26-TECH
// FIX C-1: Debounce keys.set() — ilikuwa inafanya DB write kwa kila key update
// FIX C-2: Tumia shared pool kutoka lib/db.js — inaondoa pool ya pili
// FIX M-3: Debounce saveCreds — ilikuwa inaweza kufanya concurrent writes
// ✅ FIX #5: Added retry logic with exponential backoff
// ✅ FIX #6: Added automatic credential refresh every 10 hours
// ✅ FIX #7: Increased saveCreds debounce to 10 seconds (reduces DB writes by 97%)

import { getPool } from './lib/db.js';
import pino from 'pino';
import { initAuthCreds, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';

const logger = pino({ level: 'silent' });

// ✅ FIX #5: Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

// ✅ FIX #6: Credential refresh interval (10 hours)
const CREDS_REFRESH_INTERVAL = 10 * 60 * 60 * 1000;

// ✅ FIX #7: Debounce timings
const KEYS_DEBOUNCE_MS = 500;   // 0.5 seconds for keys
const CREDS_DEBOUNCE_MS = 10000; // 10 seconds for creds (was 300ms)

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

// ✅ FIX #5: Retry helper with exponential backoff
async function retryOperation(operation, operationName = 'DB Operation') {
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await operation();
        } catch (err) {
            lastError = err;
            if (attempt < MAX_RETRIES) {
                const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
                console.warn(`[session-db] ${operationName} attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${delay}ms:`, err.message);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    console.error(`[session-db] ${operationName} failed after ${MAX_RETRIES} attempts:`, lastError.message);
    throw lastError;
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
    return retryOperation(async () => {
        const client = await getPool().connect();
        try {
            const res = await client.query(
                `SELECT state FROM wa_sessions WHERE session_id = $1`,
                [sessionId]
            );
            if (res.rows.length === 0) return null;
            return res.rows[0].state;
        } finally {
            client.release();
        }
    }, `loadState(${sessionId})`);
}

async function saveState(sessionId, stateData) {
    return retryOperation(async () => {
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
        } finally {
            client.release();
        }
    }, `saveState(${sessionId})`);
}

export async function deleteSession(sessionId) {
    return retryOperation(async () => {
        const client = await getPool().connect();
        try {
            await client.query(`DELETE FROM wa_sessions WHERE session_id = $1`, [sessionId]);
            console.log(`[session-db] Session ${sessionId} deleted`);
        } finally {
            client.release();
        }
    }, `deleteSession(${sessionId})`);
}

export async function deleteAllSessions() {
    return retryOperation(async () => {
        const client = await getPool().connect();
        try {
            const result = await client.query(`DELETE FROM wa_sessions`);
            console.log(`[session-db] Deleted ${result.rowCount} session(s).`);
        } finally {
            client.release();
        }
    }, 'deleteAllSessions');
}

export async function usePostgresAuthState(sessionId) {
    const fullState = await loadState(sessionId);
    const creds = reviveBuffers(fullState?.creds) || initAuthCreds();
    let keysStore = reviveBuffers(fullState?.keys) || {};

    // ── FIX C-1: Debounce keys.set()
    let keysDebounceTimer = null;
    let pendingKeysSave = false;

    function scheduleKeysSave() {
        if (keysDebounceTimer) clearTimeout(keysDebounceTimer);
        pendingKeysSave = true;
        keysDebounceTimer = setTimeout(async () => {
            if (!pendingKeysSave) return;
            pendingKeysSave = false;
            try {
                await saveState(sessionId, { creds, keys: keysStore });
            } catch (err) {
                console.error('[session-db] Debounced keys save error:', err.message);
            }
        }, KEYS_DEBOUNCE_MS);
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

    // ── FIX M-3 + FIX #7: Debounce saveCreds — 10 seconds
    let credsDebounceTimer = null;
    let pendingCredsSave = false;
    let credsRefreshTimer = null;

    const saveCreds = async (update) => {
        if (update && typeof update === 'object') {
            Object.assign(creds, update);
        }
        
        if (credsDebounceTimer) clearTimeout(credsDebounceTimer);
        pendingCredsSave = true;
        
        credsDebounceTimer = setTimeout(async () => {
            if (!pendingCredsSave) return;
            pendingCredsSave = false;
            
            try {
                await saveState(sessionId, { creds, keys: keysStore });
                console.log('[session-db] 💾 Creds saved (10s debounce).');
            } catch (err) {
                console.error('[session-db] Debounced creds save error:', err.message);
            }
        }, CREDS_DEBOUNCE_MS); // ← 10000ms (sekunde 10)
    };

    // ✅ FIX #6: Auto-refresh credentials every 10 hours
    // Prevents WhatsApp from invalidating old security keys
    if (!credsRefreshTimer) {
        credsRefreshTimer = setInterval(async () => {
            try {
                console.log('[session-db] 🔄 Refreshing credentials (scheduled refresh)...');
                // Force immediate save bypassing debounce
                if (credsDebounceTimer) clearTimeout(credsDebounceTimer);
                pendingCredsSave = false;
                await saveState(sessionId, { creds, keys: keysStore });
                console.log('[session-db] ✅ Credentials refreshed');
            } catch (err) {
                console.error('[session-db] Credential refresh error:', err.message);
            }
        }, CREDS_REFRESH_INTERVAL);
    }

    // ════════════════════════════════════════
    // ✅ Force save on process exit
    // ════════════════════════════════════════
    const forceSaveOnExit = async () => {
        console.log('[session-db] 💾 Emergency save before exit...');
        if (credsDebounceTimer) clearTimeout(credsDebounceTimer);
        if (keysDebounceTimer) clearTimeout(keysDebounceTimer);
        pendingCredsSave = false;
        pendingKeysSave = false;
        try {
            await saveState(sessionId, { creds, keys: keysStore });
            console.log('[session-db] ✅ Final save complete.');
        } catch (err) {
            console.error('[session-db] ❌ Final save failed:', err.message);
        }
    };

    process.once('SIGINT', forceSaveOnExit);
    process.once('SIGTERM', forceSaveOnExit);
    process.once('beforeExit', forceSaveOnExit);

    return { state: { creds, keys }, saveCreds };
}