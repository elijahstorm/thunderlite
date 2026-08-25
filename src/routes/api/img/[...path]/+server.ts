import type { RequestHandler } from './$types'
import { PUBLIC_STORAGE_ORIGIN } from '$lib/Storage/cachedImage'

// Cache a proxied public-storage image on the CDN for a year and in the browser
// for a week. The bytes behind a given URL never change — upload keys are unique
// per file, and the one key that is reused (a map's thumbnail) is versioned by
// content hash — so treat them as immutable rather than revalidating.
const CACHE_HIT = 'public, max-age=604800, s-maxage=31536000, immutable'
// Don't let a transient upstream failure get cached and pinned for a year.
const CACHE_MISS = 'no-store'

/**
 * Caching proxy for DontCode public-storage images. Fetches the object once
 * (the platform `fetch` follows the storage origin's 302 to the presigned S3
 * URL) and re-serves the bytes with long-lived cache headers against a stable
 * URL, so repeat views are served from cache instead of re-signing + re-downloading.
 *
 * The target host is fixed to PUBLIC_STORAGE_ORIGIN — only the object path comes
 * from the request, so there is no arbitrary-URL (SSRF) surface.
 */
export const GET: RequestHandler = async ({ params, fetch }) => {
	// Only the object path is forwarded. Any query string (map thumbnails carry a
	// `?v=<content hash>` so a re-uploaded preview lands on a fresh cache entry)
	// stays out of the upstream request — it exists purely as a cache key here.
	const source = `${PUBLIC_STORAGE_ORIGIN}/${params.path}`

	let upstream: Response
	try {
		upstream = await fetch(source)
	} catch {
		return new Response(null, { status: 502, headers: { 'cache-control': CACHE_MISS } })
	}

	if (!upstream.ok || !upstream.body) {
		return new Response(null, {
			status: upstream.status || 502,
			headers: { 'cache-control': CACHE_MISS },
		})
	}

	const headers = new Headers({
		'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
		'cache-control': CACHE_HIT,
	})
	const etag = upstream.headers.get('etag')
	if (etag) headers.set('etag', etag)

	return new Response(upstream.body, { headers })
}
