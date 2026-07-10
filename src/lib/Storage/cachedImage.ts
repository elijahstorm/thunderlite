/**
 * Public user uploads (avatars, map thumbnails) are served from the DontCode
 * public storage origin, which answers with a short-lived 302 to a presigned S3
 * URL. That signature changes on every request and expires in an hour, so the
 * browser can never reuse a cached response — each render re-downloads the same
 * bytes.
 *
 * {@link cachedImage} rewrites those URLs to point at our own /api/img proxy,
 * which fetches the bytes once (following the redirect) and re-serves them with
 * long-lived cache headers against a STABLE path. The upload key is unique per
 * file, so a given proxied URL is effectively immutable and safe to cache hard;
 * changing an avatar produces a new key and therefore a new URL.
 *
 * Anything not on the public storage origin (data URIs, other hosts, relative
 * paths, local mock-gateway URLs) is returned untouched, so this is a no-op
 * outside production storage.
 */
export const PUBLIC_STORAGE_ORIGIN = 'https://storage.dontcode.cafe'

export function cachedImage<T extends string | null | undefined>(src: T): T | string {
	if (!src) return src
	try {
		const url = new URL(src)
		if (`${url.protocol}//${url.host}` !== PUBLIC_STORAGE_ORIGIN) return src
		// Reconstructed 1:1 by the proxy against PUBLIC_STORAGE_ORIGIN, so only the
		// object path (never a caller-controlled host) is ever fetched server-side.
		return `/api/img/${url.pathname.replace(/^\/+/, '')}`
	} catch {
		// Relative path or otherwise not an absolute URL — leave it alone.
		return src
	}
}
