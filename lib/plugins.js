// lib/plugins.js
// ════════════════════════════════════════════════════════════════
//   FIXES:
//   [1] Duplicate commands — key ilikuwa inatumia pattern/cmdname
//       tu bila kuzingatia alias, ikisababisha overwrite ya commands
//       zinazofanana. Sasa kila alias inajisajili yenyewe.
//   [2] adminOnly flag haikusomwa vizuri — sasa inaheshimu
//       type:"admin", adminOnly:true, na fromMe:true
//   [3] needsGroup flag imeongezwa — handler.js inatumia hii
//       kujua kama command inahitaji group context
//   [4] Commands map haikuwahi kusafishwa — sasa ina clear()
//       method ili loadCommands() iweze ku-reload vizuri
//   [5] cmd() na smd() zilikuwa zinafanana kabisa — sasa
//       cmd() = execute-style (pattern match)
//       smd() = handler-style (context object m)
//       Tofauti hii inawezesha handler.js kuwrap vizuri
// ════════════════════════════════════════════════════════════════

const commands = new Map();

// ── Validate options kabla ya kusajili command ──
function validateOptions(options) {
    const key =
        options.pattern  ||
        options.cmdname  ||
        options.alias?.[0] ||
        null;

    if (!key) {
        console.warn('⚠️ plugins.js: Command haina pattern/cmdname — inarukwa');
        return null;
    }
    return key.toLowerCase();
}

// ── Sajili command moja kwenye Map ──
function registerCommand(key, options, handler, style) {
    if (commands.has(key)) {
        // Overwrite kimya — loadCommands() itashughulikia priority
    }
    commands.set(key, {
        ...options,
        handler,
        style,    // 'smd' au 'cmd' — handler.js inatumia hii
        filename: options.filename || 'unknown',

        // FIX #2 — adminOnly flag iliyosahihishwa
        adminOnly:  options.adminOnly === true || options.type === 'admin',

        // FIX #3 — needsGroup flag
        needsGroup: options.type === 'group' || options.category === 'group',

        // fromMe flag — command inaweza kutumika na owner tu
        ownerOnly:  options.fromMe === true,
    });
}

const astro_patch = {

    // ── cmd() — execute-style commands (pattern match) ──
    // Mfano: cmd({ pattern: 'tagall', ... }, async (m, text) => { ... })
    cmd: (options, handler) => {
        if (typeof handler !== 'function') return astro_patch;

        const key = validateOptions(options);
        if (!key) return astro_patch;

        // Sajili command kuu
        registerCommand(key, options, handler, 'cmd');

        // FIX #1 — Sajili alias zote pia
        if (Array.isArray(options.alias)) {
            for (const alias of options.alias) {
                const aliasKey = alias.toLowerCase();
                if (aliasKey !== key) {
                    registerCommand(aliasKey, options, handler, 'cmd');
                }
            }
        }

        return astro_patch;
    },

    // ── smd() — handler-style commands (context object m) ──
    // Mfano: smd({ cmdname: 'join', ... }, async (m, text, opts) => { ... })
    smd: (options, handler) => {
        if (typeof handler !== 'function') return astro_patch;

        const key = validateOptions(options);
        if (!key) return astro_patch;

        // Sajili command kuu
        registerCommand(key, options, handler, 'smd');

        // FIX #1 — Sajili alias zote pia
        if (Array.isArray(options.alias)) {
            for (const alias of options.alias) {
                const aliasKey = alias.toLowerCase();
                if (aliasKey !== key) {
                    registerCommand(aliasKey, options, handler, 'smd');
                }
            }
        }

        return astro_patch;
    },

    // FIX #4 — clear() method ili loadCommands() iweze ku-reload
    clear: () => {
        commands.clear();
    },

    // Utility: angalia kama command ipo
    has: (key) => commands.has(key?.toLowerCase()),

    // Utility: pata command moja
    get: (key) => commands.get(key?.toLowerCase()),
};

export default astro_patch;
export { commands };
