// lib/myfunc.js – color function with ANSI support for console logging

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
    bgMagenta: '\x1b[45m',
    bgCyan: '\x1b[46m'
};

/**
 * Wrap text with ANSI color codes
 * @param {string} text - text to color
 * @param {string} colorCode - color name (e.g., 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white')
 *                             or use 'bright', 'dim' for style, or 'bgRed' for background
 * @returns {string} colored text
 */
export function color(text, colorCode) {
    const code = colors[colorCode] || '';
    return `${code}${text}${colors.reset}`;
}

// Optional: also export the colors object if needed elsewhere
export { colors };