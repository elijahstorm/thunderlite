

export const index = 1;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/fallbacks/error.svelte.js')).default;
export const imports = ["_app/immutable/nodes/1.3bb67032.js","_app/immutable/chunks/scheduler.4123ea5a.js","_app/immutable/chunks/index.ccd460da.js","_app/immutable/chunks/singletons.a2ee2447.js","_app/immutable/chunks/index.0e1d7533.js"];
export const stylesheets = [];
export const fonts = [];
