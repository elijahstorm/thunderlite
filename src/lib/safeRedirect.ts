/**
 * Validate a post-login return target. Only same-origin absolute paths are
 * allowed; external URLs, protocol-relative (`//evil.com`) and backslash
 * (`/\evil.com`) variants are rejected so a crafted `?redirectTo=` can't bounce
 * a freshly-authenticated user off to an attacker's site (open-redirect).
 *
 * Returns the sanitized path, or `null` when the caller should fall back to a
 * default destination. Safe to run on both the server and the client.
 */
export const safeRedirect = (target: string | null | undefined): string | null => {
	if (!target) return null
	if (!target.startsWith('/')) return null
	// Reject protocol-relative / backslash tricks the browser treats as external.
	if (target.startsWith('//') || target.startsWith('/\\')) return null
	return target
}
