// Auth-protected, dynamic routes (/play, /make, /rooms). They depend on the
// signed-in user and query params, so they can't be prerendered — without this
// the crawler reaches them from the prerendered `/` page and `hooks.server`
// throws on `url.search`.
export const prerender = false
