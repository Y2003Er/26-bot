import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let commands = new Map();

// ================= LOAD COMMANDS =================
export async function loadCommands() {
    const commandsPath = path.join(__dirname, '../commands');
    if (!fs.existsSync(commandsPath)) return;

    const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

    for (const file of files) {
        try {
            const cmdPath = path.join(commandsPath, file);
            const module = await import(`file://${cmdPath}`);
            const cmd = module.default || module;
            if (cmd.name && typeof cmd.execute === 'function') {
                commands.set(cmd.name, cmd);
                console.log(`✅ Command loaded: ${cmd.name}`);
            } else {
                console.warn(`⚠️ Command ${file} missing name or execute`);
            }
        } catch (err) {
            console.error(`❌ Failed to load command ${file}:`, err.message);
        }
    }
}

// ================= GET COMMAND =================
function getCommand(name) {
    return commands.get(name);
}

// ================= HANDLE MESSAGE =================
export async function handleMessage(sock, msg) {
    try {
        const chatJid = msg.key.remoteJid;
        const senderLid = msg.key.participant || chatJid;

        const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption ||
            '';

        if (!text) return;

        const prefix = global.prefix || '.';

        // ✅ Reply detection
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        const quotedStanzaId = contextInfo?.stanzaId || '';
        const quotedParticipant = contextInfo?.participant || '';
        const isDM = !chatJid.endsWith('@g.us');

        const botId = sock.user?.id || '';
        const botLid = sock.user?.lid || '';
        const botNumber = botId.replace(/:.*@/, '').replace(/@.*/, '');
        const botLidNumber = botLid.replace(/:.*@/, '').replace(/@.*/, '');

        const isReplyInDM = isDM && !!quotedStanzaId;
        const isReplyInGroup = Boolean(
            (botNumber && quotedParticipant.includes(botNumber)) ||
            (botLidNumber && quotedParticipant.includes(botLidNumber))
        );
        const isReply = isReplyInDM || isReplyInGroup;

        // ✅ Prefix detection
        const hasPrefix = text.startsWith(prefix);
        const hasAPrefix = /^[aA] /i.test(text);

        // Ruhusu tu: prefix commands, a/A prefix, au reply
        if (!hasPrefix && !hasAPrefix && !isReply) return;

        let cmdName, args;

        if (hasPrefix) {
            // Normal prefix command: .ai, .bot, .ping, n.k
            const parts = text.slice(prefix.length).trim().split(/\s+/);
            cmdName = parts.shift()?.toLowerCase();
            args = parts;
        } else {
            // Reply au "a/A " — peleka moja kwa moja kwa ai
            cmdName = 'ai';
            args = text.split(/\s+/);
        }

        const cmd = getCommand(cmdName);
        if (!cmd) return;

        msg.senderLid = senderLid;
        await cmd.execute(sock, msg, args);

    } catch (err) {
        console.error('Message handler error:', err);
    }
}

// ================= CONTACT LISTENER =================
export function setupContactListener(sock) {
    if (!sock || !sock.ev) return;

    const contactCache = new Map();

    sock.ev.on('contacts.update', (contacts) => {
        if (!Array.isArray(contacts)) return;
        for (const c of contacts) {
            const lid = c.id;
            if (!lid) continue;
            contactCache.set(lid, {
                name: c.notify || c.name || '',
                verifiedName: c.verifiedName || '',
                imgUrl: c.imgUrl || null,
                jid: c.jid || null,
                updatedAt: Date.now()
            });
        }
    });

    global.contactCache = contactCache;
    global.getPhoneNumberFromLid = async (sock, lid) => {
        try {
            const info = await sock.getLid(lid);
            return info?.jid || null;
        } catch {
            return null;
        }
    };
}