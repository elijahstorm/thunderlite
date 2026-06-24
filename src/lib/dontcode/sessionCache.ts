/**
 * Per-request session resolution cache (server-only).
 *
 * `auth.me()` is a network round-trip to the DontCode backend. Without caching
 * it runs on every server request — every page load and every `/api/*` call —
 * which serializes a remote hop in front of all navigation and reads. We cache
 * the resolved user keyed by access token for a short window so repeat requests
 * within that window skip the network entirely.
 *
 * Two failure modes are handled differently, and the distinction is the whole
 * point:
 *   - A definitive "not signed in" (the fetcher returns `null`, i.e. a 401) is
 *     cached as null — the user is genuinely logged out.
 *   - A transient backend failure (the fetcher throws) does NOT log the user
 *     out. We serve the last-known user for that token if we have one. This is
 *     what stops a momentary platform hiccup on a refresh from bouncing a
 *     signed-in user to /login.
 *
 * In-memory only. Under Fluid Compute, instances are reused across requests so
 * this is an effective hot cache; on a cold instance it simply repopulates.
 */

export interface CachedUser {
	id: string
	email?: string | null
}

interface Entry {
	user: CachedUser | null
	fetchedAt: number
}

/** How long a resolved result is trusted before we re-validate. */
const TTL_MS = 60_000
/** Hard cap on tracked tokens; oldest entries are evicted past this. */
const MAX_ENTRIES = 1000

const cache = new Map<string, Entry>()

const prune = (now: number) => {
	for (const [token, entry] of cache) {
		if (now - entry.fetchedAt >= TTL_MS) cache.delete(token)
	}
	// Still over the cap after dropping stale entries: evict oldest-inserted.
	while (cache.size > MAX_ENTRIES) {
		const oldest = cache.keys().next().value
		if (oldest === undefined) break
		cache.delete(oldest)
	}
}

/**
 * Resolve the user for an access token, using the cache when fresh and falling
 * back to the network via `fetcher` otherwise. On a transient `fetcher` failure
 * the last-known value (even if stale) is returned rather than nulling out.
 */
export const resolveCachedUser = async (
	token: string,
	fetcher: (token: string) => Promise<CachedUser | null>
): Promise<CachedUser | null> => {
	const now = Date.now()
	const entry = cache.get(token)

	if (entry && now - entry.fetchedAt < TTL_MS) {
		return entry.user
	}

	try {
		const user = await fetcher(token)
		cache.set(token, { user, fetchedAt: now })
		if (cache.size > MAX_ENTRIES) prune(now)
		return user
	} catch {
		// Transient backend failure — keep the user signed in on last-known state.
		if (entry) return entry.user
		return null
	}
}

/** Drop a token from the cache (e.g. on explicit logout). */
export const invalidateCachedUser = (token: string) => {
	cache.delete(token)
}

/** Test-only: reset all cached state. */
export const _clearSessionCache = () => {
	cache.clear()
}
