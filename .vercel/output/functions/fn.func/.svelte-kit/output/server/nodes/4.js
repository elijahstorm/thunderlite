

export const index = 4;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/play/_page.svelte.js')).default;
export const imports = ["_app/immutable/nodes/4.6a2e61c1.js","_app/immutable/chunks/scheduler.4123ea5a.js","_app/immutable/chunks/index.ccd460da.js","_app/immutable/chunks/mapStore.0412660f.js","_app/immutable/chunks/index.0e1d7533.js"];
export const stylesheets = [];
export const fonts = [];
