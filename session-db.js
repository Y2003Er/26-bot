'use strict';

/**
 * session-db.js
 * PostgreSQL-backed WhatsApp session persistence for Anita-V5.
 * Session inahifadhiwa DB peke yake — hakuna faili za local.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const {
    initAuthCreds,
    proto,
} = require('@whiskeysockets/baileys');

// ─── Connection pool ──────────────────────────────────────────────────────────

let pool = null;
let dbAvailable = false;

function getPool() {
    if (pool) return pool;

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.warn('[session-db] DATABASE_URL haipo — Bot imesimama.');
        process.exit(1);
    }

    pool = new Pool({
        connectionString,
        ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
        max: 5,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
    });

    pool.on('error', (err) => {
        console.error('[session-db] Pool error:', err.message);
    });

    return pool;
}

// ─── Schema initialisation ────────────────────────────────────────────────────

async function initializeDatabase() {
    const p = getPool();
    if (!p) return false;

    try {
        await p.query(`
            CREATE TABLE IF NOT EXISTS whatsapp_sessions (
                session_id   TEXT        PRIMARY KEY,
                session_data JSONB       NOT NULL,
                created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        await p.query(`
            CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_session_id
                ON whatsapp_sessions (session_id);
        `);

        dbAvailable = true;
        console.log('[session-db] ✔ Database tayari.');
        return true;
    } catch (err) {
        console.error('[session-db] Kuanzisha DB kumeshindwa:', err.message);
        dbAvailable = false;
        return false;
    }
}

// ─── CRUD helpers ─────────────────────────────────────────────────────────────

async function saveSession(sessionId, sessionData) {
    if (!dbAvailable) return false;
    const p = getPool();
    if (!p) return false;

    try {
        await p.query(`
            INSERT INTO whatsapp_sessions (session_id, session_data, updated_at)
            VALUES ($1, $2::jsonb, NOW())
            ON CONFLICT (session_id)
            DO UPDATE SET session_data = EXCLUDED.session_data,
                          updated_at   = NOW();
        `, [sessionId, JSON.stringify(sessionData)]);
        return true;
    } catch (err) {
        console.error('[session-db] saveSession error:', err.message);
        return false;
    }
}

async function loadSession(sessionId) {
    if (!dbAvailable) return null;
    const p = getPool();
    if (!p) return null;

    try {
        const result = await p.query(
            `SELECT session_data FROM whatsapp_sessions WHERE session_id = $1 LIMIT 1;`,
            [sessionId]
        );
        if (result.rows.length === 0) return null;
        return result.rows[0].session_data;
    } catch (err) {
        console.error('[session-db] loadSession error:', err.message);
        return null;
    }
}

async function deleteSession(sessionId) {
    if (!dbAvailable) return false;
    const p = getPool();
    if (!p) return false;

    try {
        await p.query(
            `DELETE FROM whatsapp_sessions WHERE session_id = $1;`,
            [sessionId]
        );
        console.log(`[session-db] Session "${sessionId}" imefutwa.`);
        return true;
    } catch (err) {
        console.error('[session-db] deleteSession error:', err.message);
        return false;
    }
}

async function sessionExistsInDB(sessionId) {
    if (!dbAvailable) return false;
    const p = getPool();
    if (!p) return false;

    try {
        const res = await p.query(
            `SELECT 1 FROM whatsapp_sessions WHERE session_id = $1 LIMIT 1;`,
            [sessionId]
        );
        return res.rows.length > 0;
    } catch {
        return false;
    }
}

// ─── usePostgresAuthState ─────────────────────────────────────────────────────
// Badala kamili ya useMultiFileAuthState — inatumia DB peke yake

async function usePostgresAuthState(sessionId) {
    // Soma session yote kutoka DB (object moja)
    let stored = await loadSession(sessionId);

    // creds — soma au unda mpya
    let creds = stored?.creds ?? null;
    if (!creds) {
        creds = initAuthCreds();
        console.log('[session-db] Session mpya — Inahitaji pairing.');
    } else {
        console.log('[session-db] ✔ Session inapatikana — Inaunganika...');
    }

    // keys — soma kutoka stored au anza na tupu
    let keysData = stored?.keys ?? {};

    // Hifadhi session yote (creds + keys) kwenye DB
    async function persist() {
        await saveSession(sessionId, { creds, keys: keysData });
    }

    const keys = {
        get: async (type, ids) => {
            const data = {};
            for (const id of ids) {
                const val = keysData[`${type}:${id}`];
                if (val) {
                    // Baileys inahitaji proto object kwa aina hii
                    if (type === 'app-state-sync-key') {
                        data[id] = proto.Message.AppStateSyncKeyData.fromObject(val);
                    } else {
                        data[id] = val;
                    }
                }
            }
            return data;
        },

        set: async (data) => {
            for (const [type, ids] of Object.entries(data)) {
                for (const [id, value] of Object.entries(ids ?? {})) {
                    const k = `${type}:${id}`;
                    if (value) {
                        keysData[k] = value;
                    } else {
                        delete keysData[k];
                    }
                }
            }
            await persist();
        },
    };

    const saveCreds = async () => {
        await persist();
    };

    return {
        state: { creds, keys },
        saveCreds,
    };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    initializeDatabase,
    usePostgresAuthState,
    saveSession,
    loadSession,
    deleteSession,
    sessionExistsInDB,
};
