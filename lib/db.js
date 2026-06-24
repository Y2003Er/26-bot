// lib/db.js — Shared DB Pool Singleton
import pg from 'pg';

let _pool = null;

export function getPool() {
    if (_pool) return _pool;
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
    
    _pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
    });

    _pool.on('error', (err) => console.error('[DB] Pool error:', err.message));
    
    return _pool;
}

export default getPool;
