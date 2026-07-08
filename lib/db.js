// lib/db.js — Shared DB Pool Singleton with Heartbeat
import pg from 'pg';

let _pool = null;
let _heartbeatTimer = null;

export function getPool() {
    if (_pool) return _pool;
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
    
    _pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 10,
        // ✅ FIX #4: Increased from 30s → 300s (5 min)
        // Prevents premature connection timeout on long queries
        idleTimeoutMillis: 300000,
        // ✅ FIX #4: Increased from 10s → 30s
        // Better timeout for slow network conditions
        connectionTimeoutMillis: 30000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
    });

    // ✅ FIX #7: Database pool error handler
    _pool.on('error', (err) => {
        console.error('[DB] 🔴 Pool error:', err.message);
    });

    // ✅ FIX #7: Start database heartbeat to keep connections alive
    startDatabaseHeartbeat();
    
    return _pool;
}

// ✅ FIX #7: Database heartbeat - ping pool every 2 minutes
// Prevents connections from dying during idle periods
function startDatabaseHeartbeat() {
    if (_heartbeatTimer) clearInterval(_heartbeatTimer);
    
    _heartbeatTimer = setInterval(async () => {
        if (!_pool) return;
        try {
            const client = await _pool.connect();
            await client.query('SELECT 1');
            client.release();
            // Silently succeed - heartbeat is just to keep connection warm
        } catch (err) {
            console.warn('[DB] 💔 Heartbeat failed:', err.message);
            // Don't crash - just log and continue
        }
    }, 2 * 60 * 1000); // Every 2 minutes
}

// ✅ Cleanup function for graceful shutdown
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
