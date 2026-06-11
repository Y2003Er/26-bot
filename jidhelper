/**
 * lib/jidHelper.js
 * JID Helper Utilities for LID-aware matching — Toleo la ES Modules la 26-TECH
 */

import { jidDecode, jidEncode } from '@whiskeysockets/baileys';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── LID mapping cache ──
const lidMappingCache = new Map();

// Pata LID mapping kutoka files
const getLidMappingValue = (user, direction) => {
    if (!user) return null;
    const cacheKey = `${direction}:${user}`;
    if (lidMappingCache.has(cacheKey)) return lidMappingCache.get(cacheKey);

    const sessionName = process.env.SESSION_ID || '26_tech_v5';
    const sessionPath = path.join(__dirname, '..', sessionName);
    const suffix      = direction === 'pnToLid' ? '.json' : '_reverse.json';
    const filePath    = path.join(sessionPath, `lid-mapping-${user}${suffix}`);

    if (!fs.existsSync(filePath)) {
        lidMappingCache.set(cacheKey, null);
        return null;
    }

    try {
        const raw   = fs.readFileSync(filePath, 'utf8').trim();
        const value = raw ? JSON.parse(raw) : null;
        lidMappingCache.set(cacheKey, value || null);
        return value || null;
    } catch {
        lidMappingCache.set(cacheKey, null);
        return null;
    }
};

// Normalize JID ikizingatia LID
const normalizeJidWithLid = (jid) => {
    if (!jid) return jid;
    try {
        const decoded = jidDecode(jid);
        if (!decoded?.user) {
            return `${jid.split(':')[0].split('@')[0]}@s.whatsapp.net`;
        }

        let user   = decoded.user;
        let server = decoded.server === 'c.us' ? 's.whatsapp.net' : decoded.server;

        const mapToPn = () => {
            const pnUser = getLidMappingValue(user, 'lidToPn');
            if (pnUser) {
                user   = pnUser;
                server = server === 'hosted.lid' ? 'hosted' : 's.whatsapp.net';
                return true;
            }
            return false;
        };

        if (server === 'lid' || server === 'hosted.lid') {
            mapToPn();
        } else if (server === 's.whatsapp.net' || server === 'hosted') {
            mapToPn();
        }

        if (server === 'hosted') return jidEncode(user, 'hosted');
        return jidEncode(user, 's.whatsapp.net');
    } catch {
        return jid;
    }
};

// Jenga orodha ya JID variants (PN + LID) kwa matching
const buildComparableIds = (jid) => {
    if (!jid) return [];
    try {
        const decoded = jidDecode(jid);
        if (!decoded?.user) {
            return [normalizeJidWithLid(jid)].filter(Boolean);
        }

        const variants       = new Set();
        const normalizedServer = decoded.server === 'c.us' ? 's.whatsapp.net' : decoded.server;

        variants.add(jidEncode(decoded.user, normalizedServer));

        const isPnServer  = normalizedServer === 's.whatsapp.net' || normalizedServer === 'hosted';
        const isLidServer = normalizedServer === 'lid' || normalizedServer === 'hosted.lid';

        if (isPnServer) {
            const lidUser = getLidMappingValue(decoded.user, 'pnToLid');
            if (lidUser) {
                const lidServer = normalizedServer === 'hosted' ? 'hosted.lid' : 'lid';
                variants.add(jidEncode(lidUser, lidServer));
            }
        } else if (isLidServer) {
            const pnUser = getLidMappingValue(decoded.user, 'lidToPn');
            if (pnUser) {
                const pnServer = normalizedServer === 'hosted.lid' ? 'hosted' : 's.whatsapp.net';
                variants.add(jidEncode(pnUser, pnServer));
            }
        }

        return Array.from(variants);
    } catch {
        return [jid];
    }
};

// Tafuta participant kwa PN JID au LID JID
const findParticipant = (participants = [], userIds) => {
    const targets = (Array.isArray(userIds) ? userIds : [userIds])
        .filter(Boolean)
        .flatMap(id => buildComparableIds(id));

    if (!targets.length) return null;

    return participants.find(participant => {
        if (!participant) return false;
        const participantIds = [
            participant.id,
            participant.lid,
            participant.userJid
        ]
            .filter(Boolean)
            .flatMap(id => buildComparableIds(id));

        return participantIds.some(id => targets.includes(id));
    }) || null;
};

export {
    findParticipant,
    buildComparableIds,
    normalizeJidWithLid,
    getLidMappingValue
};
