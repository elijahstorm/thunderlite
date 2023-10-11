

export const index = 4;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/play/_page.svelte.js')).default;
export const imports = ["_app/immutable/nodes/4.a7da8ab5.js","_app/immutable/chunks/scheduler.0cef3f82.js","_app/immutable/chunks/index.5079a6aa.js","_app/immutable/chunks/mapStore.a8604105.js","_app/immutable/chunks/index.1e0a63b8.js"];
export const stylesheets = [];
export const fonts = [];
