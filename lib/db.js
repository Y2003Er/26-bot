// lib/db.js — FIXED FOR RAILWAY FREE
import pg from 'pg';

let _pool = null;
let _heartbeatTimer = null;

export function getPool() {
    if (_pool) return _pool;
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');

    _pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 2, // ✅ kutoka 10 weka 2. Railway inakubali 3 max
        idleTimeoutMillis: 10000, // ✅ kutoka 5min weka 10s
        connectionTimeoutMillis: 5000, // ✅ kutoka 30s weka 5s
        statement_timeout: 5000, // ✅ ongeza hii mpya
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
    });

    _pool.on('error', (err) => {
        console.error('[DB] 🔴 Pool error:', err.message);
    });

    startDatabaseHeartbeat();
    return _pool;
}

function startDatabaseHeartbeat() {
    if (_heartbeatTimer) clearInterval(_heartbeatTimer);
    _heartbeatTimer = setInterval(async () => {
        if (!_pool) return;
        try {
            const client = await _pool.connect();
            await client.query('SELECT 1');
            client.release();
        } catch (err) {
            console.warn('[DB] 💔 Heartbeat failed:', err.message);
        }
    }, 2 * 60 * 1000);
}

export function closePool() {
    if (_heartbeatTimer) {
        clearInterval(_heartbeatTimer);
        _heartbeatTimer = null;
    }
    if (_pool) {
        return _pool.end();
    }
}

export default getPool;