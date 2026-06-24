import dotenv from 'dotenv';
import fs from 'fs';
import { color } from './lib/myfunc.js';

dotenv.config();

const toBool = (value) => value === "true";

// ========== EXPORTS PEKE YAKE — L-7: Futa global assignments ==========
// Global assignments zilirudiarudia exports bila faida —
// chanzo cha ukweli sasa ni exports peke yake.
// Code inayohitaji values hizi itumie import badala ya global.
export const owner = process.env.OWNER_NUMBER;
export const nomerowner = process.env.OWNER_NUMBERS;
export const menu_image = process.env.MENU_IMAGE;
export const ANTI_TEMU = toBool(process.env.ANTI_TEMU);
export const ANTI_TAG = toBool(process.env.ANTI_TAG);
export const bot_name = process.env.BOT_NAME;
export const publicVar = toBool(process.env.PUBLIC);
export const packname = process.env.PACK_NAME;
export const author = process.env.AUTHOR;
export const ANTIDELETE = toBool(process.env.ANTI_DELETE);
export const ANTI_CALL = toBool(process.env.ANTI_CALL);
export const unavailable = toBool(process.env.UNAVAILABLE);
export const available = toBool(process.env.AVAILABLE);
export const autoreadmessages = toBool(process.env.AUTO_READ_MESSAGES);
export const chatbot = toBool(process.env.CHATBOT);
export const autoreact = toBool(process.env.AUTO_REACT);
export const autoTyping = toBool(process.env.AUTO_TYPING);
export const autoViewStatus = toBool(process.env.AUTO_STATUS_VIEW);
export const autoStatusReact = toBool(process.env.AUTO_STATUS_REACT);
export const welcome = toBool(process.env.WELCOME);
export const anticall = toBool(process.env.ANTI_CALL);
export const autobio = toBool(process.env.AUTO_BIO);
export const prefix = process.env.PREFIX;

// ✅ FIX M-7: watchFile inafanya kazi tu kwenye development
// Kwenye Railway (production), config haibadiliki — watcher haina faida
// lakini inatumia OS polling resources bure
if (process.env.NODE_ENV !== 'production') {
    const configPath = new URL(import.meta.url).pathname;
    fs.watchFile(configPath, () => {
        console.log(color(`⚠️ Config file imebadilika. Tafadhali restart bot ili mabadiliko yaanze kutumika.`, 'yellow'));
    });
}