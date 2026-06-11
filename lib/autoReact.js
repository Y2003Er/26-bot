/**
 * lib/autoReact.js
 * Auto React utility — Toleo la ES Modules la 26-TECH
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, '../config.js');

// Soma mipangilio ya autoReact kutoka config.js
function load() {
    try {
        // Soma config.js kama text na toa maadili kwa regex
        // (ESM haitetemeki require.cache — tunasoma file moja kwa moja)
        const content = fs.readFileSync(CONFIG_PATH, 'utf8');

        const enabledMatch = content.match(/autoReact\s*:\s*(true|false)/);
        const modeMatch    = content.match(/autoReactMode\s*:\s*['"](\w+)['"]/);

        return {
            enabled: enabledMatch ? enabledMatch[1] === 'true' : false,
            mode:    modeMatch    ? modeMatch[1]               : 'bot'
        };
    } catch {
        return { enabled: false, mode: 'bot' };
    }
}

// Hifadhi mipangilio ya autoReact kwenye config.js
function save(data) {
    try {
        let content = fs.readFileSync(CONFIG_PATH, 'utf8');

        // Sasisha autoReact value
        content = content.replace(
            /autoReact\s*:\s*(true|false)/,
            `autoReact: ${data.enabled}`
        );

        // Sasisha au ongeza autoReactMode
        if (content.includes('autoReactMode:')) {
            content = content.replace(
                /autoReactMode\s*:\s*['"]\w+['"]/,
                `autoReactMode: '${data.mode}'`
            );
        } else {
            content = content.replace(
                /(autoReact\s*:\s*(?:true|false),?)/,
                `$1\n    autoReactMode: '${data.mode}',`
            );
        }

        fs.writeFileSync(CONFIG_PATH, content, 'utf8');
    } catch (err) {
        console.error('[autoReact] save error:', err);
    }
}

export { load, save };
