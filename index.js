'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { default: makeWASocket, DisconnectReason, Browsers, useSingleFileAuthState } = require('@whiskeysockets/baileys');

// ---------------------------- KONFIGURATION ----------------------------
const SESSION_DIR = '/app/sessions';
const SESSION_FILE = path.join(SESSION_DIR, 'session.json');
const PHONE_NUMBER = process.env.PHONE_NUMBER ? process.env.PHONE_NUMBER.trim() : null;

// Hakikisha folder ya volume ipo
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

console.log(chalk.green('=============================='));
console.log(chalk.green('  QUEEN_ANITA-V5 STARTING  '));
console.log(chalk.green('=============================='));

// ---------------------------- STATE ----------------------------
const { state, saveCreds } = useSingleFileAuthState(SESSION_FILE);

// ---------------------------- BOT ----------------------------
let sock;
let isPairing = false;

async function startBot() {
    try {
        sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            browser: Browsers.windows('Chrome'),
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                console.log(chalk.green(`🟢 BOT ONLINE - ${sock.user?.id || 'unknown'}`));
                isPairing = false;
            }
            if (connection === 'close') {
                const code = lastDisconnect?.error?.output?.statusCode;
                console.log(chalk.red(`🔴 CONNECTION CLOSED (${code})`));
                if (code !== DisconnectReason.loggedOut) {
                    console.log(chalk.yellow('🔄 Reconnecting in 5 seconds...'));
                    setTimeout(startBot, 5000);
                } else {
                    console.log(chalk.red('❌ Logged out. Delete session.json and restart.'));
                }
            }
        });

        // Subiri socket iwe tayari (kwa usalama)
        await new Promise(r => setTimeout(r, 4000));

        // Ikiwa haijasajiliwa, omba pairing code
        if (!state.creds.registered && !isPairing && PHONE_NUMBER) {
            isPairing = true;
            console.log(chalk.blue('⏳ Requesting pairing code...'));
            try {
                const code = await sock.requestPairingCode(PHONE_NUMBER);
                console.log(chalk.green(`🔑 PAIRING CODE: ${code}`));
                console.log(chalk.cyan('Enter this code in WhatsApp > Linked Devices'));
            } catch (err) {
                console.error(chalk.red('❌ Pairing error:'), err.message);
                isPairing = false;
                // Jaribu tena baada ya sekunde 10
                setTimeout(() => { startBot(); }, 10000);
            }
        } else if (!state.creds.registered) {
            console.log(chalk.red('❌ PHONE_NUMBER not set in .env'));
            process.exit(1);
        } else {
            console.log(chalk.green('✅ Valid session exists. No pairing needed.'));
        }

        console.log(chalk.yellow('[✓] Bot initializing...'));
    } catch (err) {
        console.error(chalk.red('BOT ERROR:'), err);
        setTimeout(startBot, 5000);
    }
}

// ---------------------------- START ----------------------------
// Futa session batili ikiwa ipo (kwa sababu ya makosa ya validation)
if (fs.existsSync(SESSION_FILE)) {
    try {
        const test = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
        if (!test.creds || !test.creds.registered) {
            console.log(chalk.yellow('⚠️ Invalid session detected. Deleting...'));
            fs.unlinkSync(SESSION_FILE);
        }
    } catch(e) {
        console.log(chalk.yellow('⚠️ Corrupt session file. Deleting...'));
        fs.unlinkSync(SESSION_FILE);
    }
}

startBot();