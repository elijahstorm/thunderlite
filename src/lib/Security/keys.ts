export const KEY_SOURCE = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export const generateKey = (length: number = 16) =>
	Array.from({ length }, () => KEY_SOURCE[Math.floor(Math.random() * KEY_SOURCE.length)]).join('')

/**
 * Public, URL-facing identifier for a stored map (`maps.public_id`). A 12-char
 * base62 id (62^12 ≈ 3e21) keeps shared `/map/<id>` links short and opaque while
 * leaving collisions astronomically unlikely; the `unique` constraint on
 * `public_id` is the real backstop, and the upload endpoint retries on the rare
 * clash. Replaces the old content-addressed SHA-256 map key.
 */
export const generateMapId = () => generateKey(12)
