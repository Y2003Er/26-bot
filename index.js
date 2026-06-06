'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const {
  default: makeWASocket,
  useSingleFileAuthState,      // 🔁 Badala ya useMultiFileAuthState
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const BASE_DIR = process.cwd();
const SESSION_FILE = path.join(BASE_DIR, 'session.json');
const PHONE_NUMBER = process.env.PHONE_NUMBER;  // Inaweza kubaki .env

console.log(chalk.green('=============================='));
console.log(chalk.green('  QUEEN_ANITA-V5 STARTING  '));
console.log(chalk.green('=============================='));

// ------------------------------------------------------------
// 1. Ikiwa SESSION_JSON ipo kwenye environment, iandike kwenye faili
// ------------------------------------------------------------
if (process.env.SESSION_JSON) {
  try {
    const sessionData = JSON.parse(process.env.SESSION_JSON);
    fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2));
    console.log(chalk.green('✓ Session imeandikwa kutoka SESSION_JSON env'));
  } catch (err) {
    console.error(chalk.red('❌ Kosa la kusoma SESSION_JSON:'), err.message);
  }
}

// ------------------------------------------------------------
// 2. Anzisha bot
// ------------------------------------------------------------
async function startBot() {
  try {
    const { state, saveCreds } = useSingleFileAuthState(SESSION_FILE);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,      // Zima QR
      browser: ['Queen_Anita-V5', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        console.log(chalk.green(`🟢 QUEEN_ANITA-V5 IS ONLINE - ${sock.user?.id || 'unknown'}`));
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log(chalk.red('🔴 CONNECTION CLOSED:'), statusCode);

        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          console.log(chalk.yellow('♻️ Reconnecting in 5 seconds...'));
          setTimeout(startBot, 5000);
        } else {
          console.log(chalk.red('❌ Logged out. Futa session.json na uweke mpya.'));
        }
      }
    });

    // --------------------------------------------------------
    // 3. Omba pairing code IKIWA TU HAJAS AJILIWA
    // --------------------------------------------------------
    if (!state.creds.registered) {
      if (PHONE_NUMBER) {
        try {
          const code = await sock.requestPairingCode(PHONE_NUMBER);
          console.log(chalk.yellow('🔑 PAIRING CODE:'), code);
          console.log(chalk.cyan('💡 Ingiza code kwenye WhatsApp > Linked Devices'));
        } catch (e) {
          console.log(chalk.red('❌ Pairing error:'), e.message);
        }
      } else {
        console.log(chalk.yellow('⚠️ Hakuna PHONE_NUMBER. Tafadhali weka kwenye .env'));
      }
    } else {
      console.log(chalk.green('✅ Session tayari imesajiliwa. Hakuna pairing inayohitajika.'));
    }

    console.log(chalk.yellow('[✓] Bot initializing...'));

  } catch (err) {
    console.error(chalk.red('BOT ERROR:'), err);
    setTimeout(() => startBot(), 5000);
  }
}

startBot();