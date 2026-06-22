// lib/myfunc.js – Modern ANSI color utility (ESM)

const ANSI = {
    // Reset
    reset:      '\x1b[0m',
    // Styles
    bold:       '\x1b[1m',
    dim:        '\x1b[2m',
    italic:     '\x1b[3m',
    underline:  '\x1b[4m',
    // Foreground colors
    black:      '\x1b[30m',
    red:        '\x1b[31m',
    green:      '\x1b[32m',
    yellow:     '\x1b[33m',
    blue:       '\x1b[34m',
    magenta:    '\x1b[35m',
    cyan:       '\x1b[36m',
    white:      '\x1b[37m',
    gray:       '\x1b[90m',
    // Bright foreground
    redBright:      '\x1b[91m',
    greenBright:    '\x1b[92m',
    yellowBright:   '\x1b[93m',
    blueBright:     '\x1b[94m',
    magentaBright:  '\x1b[95m',
    cyanBright:     '\x1b[96m',
    whiteBright:    '\x1b[97m',
    // Background
    bgRed:      '\x1b[41m',
    bgGreen:    '\x1b[42m',
    bgYellow:   '\x1b[43m',
    bgBlue:     '\x1b[44m',
    bgMagenta:  '\x1b[45m',
    bgCyan:     '\x1b[46m',
    bgGray:     '\x1b[100m',
};

/**
 * Color/style text with ANSI codes
 * @param {string} text
 * @param {...string} styles - one or more style names (e.g. 'bold', 'red', 'bgBlue')
 * @returns {string}
 */
export const color = (text, ...styles) => {
    const prefix = styles.map(s => ANSI[s] ?? '').join('');
    return `${prefix}${text}${ANSI.reset}`;
};

/**
 * Chainable color builder
 * @example chalk.bold.red('Error!') → bold red text
 */
export const chalk = new Proxy({}, {
    get(_, style) {
        const chain = [style];
        const proxy = new Proxy((...args) => color(args[0], ...chain), {
            get(_, next) {
                chain.push(next);
                return proxy;
            }
        });
        return proxy;
    }
});

export { ANSI as colors };