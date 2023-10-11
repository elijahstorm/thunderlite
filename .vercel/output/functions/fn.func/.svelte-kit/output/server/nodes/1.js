

export const index = 1;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/fallbacks/error.svelte.js')).default;
export const imports = ["_app/immutable/nodes/1.68143677.js","_app/immutable/chunks/scheduler.0cef3f82.js","_app/immutable/chunks/index.5079a6aa.js","_app/immutable/chunks/singletons.c8ec660d.js","_app/immutable/chunks/index.1e0a63b8.js"];
export const stylesheets = [];
export const fonts = [];
