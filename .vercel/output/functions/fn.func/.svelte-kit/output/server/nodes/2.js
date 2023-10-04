

export const index = 2;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export const imports = ["_app/immutable/nodes/2.8f8f6067.js","_app/immutable/chunks/scheduler.4123ea5a.js","_app/immutable/chunks/index.ccd460da.js","_app/immutable/chunks/MapEditor.50fb7a59.js","_app/immutable/chunks/mapStore.0412660f.js","_app/immutable/chunks/index.0e1d7533.js","_app/immutable/chunks/each.0583d308.js"];
export const stylesheets = [];
export const fonts = [];
