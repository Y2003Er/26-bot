// lib/plugins.js
const commands = new Map();

const astro_patch = {
   cmd: (options, handler) => {
      if (typeof handler === "function") {
         const key = options.pattern || options.cmdname || options.alias?.[0] || "unknown";
         commands.set(key, {
            ...options,
            handler,
            filename: options.filename || import.meta.url
         });
      }
      return astro_patch;
   },
   smd: (options, handler) => {
      if (typeof handler === "function") {
         const key = options.pattern || options.cmdname || "unknown";
         commands.set(key, {
            ...options,
            handler,
            filename: options.filename || import.meta.url
         });
      }
      return astro_patch;
   }
};

// Export ili handler.js iweze kuitumia
export default astro_patch;
export { commands };
