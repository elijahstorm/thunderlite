/**
 * Signed live frames.
 *
 * A live frame is an action the acting client publishes straight to the room's
 * socket channel, ahead of the server recording it. The realtime service relays
 * the payload verbatim and attaches nothing about who sent it, so without more a
 * frame's `sender` is whatever the client claims. That is fine for chat and not
 * fine for a move: an opponent's screen would follow a forged frame until the
 * committed turn arrived, and a row sealed by a witness could carry turns the
 * actor never played.
 *
 * So every client signs its frames. Each player holds an ECDSA P-256 key for the
 * match, generated in the browser and kept there (the private key never leaves;
 * see `matchKey.ts`); the public half is registered on the seat, and travels to
 * the other clients with the roster. A receiver verifies before it applies, and
 * the server can verify a turn a witness hands it against the actor's registered
 * key. What is signed binds the action to the room, the sender, the turn and the
 * position, so a frame cannot be replayed into another room or another slot.
 *
 * Isomorphic on purpose: WebCrypto exists in the browser and in Node, so the same
 * code signs in the client, verifies in the client, and verifies on the server.
 */

export type PublicKeyJwk = { kty: 'EC'; crv: 'P-256'; x: string; y: string }

/** What a signature covers. Canonicalised (sorted keys) before signing. */
export type SignedFrameBody = {
	session: string
	sender: string
	turn: number
	index: number
	action: unknown
}

const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' } as const
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const

const subtle = (): SubtleCrypto => {
	const s = globalThis.crypto?.subtle
	if (!s) throw new Error('WebCrypto is not available')
	return s
}

/**
 * JSON with every object's keys in sorted order, recursively, so the same frame
 * serialises identically whichever side built the object and in whatever key
 * order a JSON round trip left it.
 */
export const canonicalize = (value: unknown): string => {
	if (value === null || typeof value !== 'object') return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
	const record = value as Record<string, unknown>
	const keys = Object.keys(record)
		.filter((k) => record[k] !== undefined)
		.sort()
	return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(record[k])}`).join(',')}}`
}

const encoder = new TextEncoder()
// Copied into a fresh ArrayBuffer-backed view: TextEncoder's result is typed
// over ArrayBufferLike, which WebCrypto's BufferSource parameter refuses.
const bytesOf = (body: SignedFrameBody): Uint8Array<ArrayBuffer> =>
	Uint8Array.from(encoder.encode(canonicalize(body)))

const toBase64Url = (bytes: ArrayBuffer): string => {
	let binary = ''
	for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b)
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromBase64Url = (text: string): Uint8Array | null => {
	try {
		const padded =
			text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)
		const binary = atob(padded)
		const bytes = new Uint8Array(binary.length)
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
		return bytes
	} catch {
		return null
	}
}

/** A fresh match key. The private half is not extractable; the public half is JWK. */
export const generateSigningKey = async (): Promise<{
	privateKey: CryptoKey
	publicKey: CryptoKey
	publicJwk: PublicKeyJwk
}> => {
	const pair = await subtle().generateKey(ALGORITHM, false, ['sign', 'verify'])
	const jwk = await subtle().exportKey('jwk', pair.publicKey)
	return {
		privateKey: pair.privateKey,
		publicKey: pair.publicKey,
		publicJwk: { kty: 'EC', crv: 'P-256', x: String(jwk.x), y: String(jwk.y) },
	}
}

/** Is this a public key we would accept from a client? Shape only; import proves the rest. */
export const isPublicKeyJwk = (value: unknown): value is PublicKeyJwk => {
	if (!value || typeof value !== 'object') return false
	const v = value as Record<string, unknown>
	const b64 = /^[A-Za-z0-9_-]{40,50}$/
	return (
		v.kty === 'EC' &&
		v.crv === 'P-256' &&
		typeof v.x === 'string' &&
		typeof v.y === 'string' &&
		b64.test(v.x) &&
		b64.test(v.y)
	)
}

export const signFrame = async (privateKey: CryptoKey, body: SignedFrameBody): Promise<string> =>
	toBase64Url(await subtle().sign(SIGN, privateKey, bytesOf(body)))

/** Imported verify keys, by their JWK text, so a match verifies against each key once. */
const imported = new Map<string, Promise<CryptoKey | null>>()

const importPublic = (jwk: PublicKeyJwk): Promise<CryptoKey | null> => {
	const id = `${jwk.x}.${jwk.y}`
	let pending = imported.get(id)
	if (!pending) {
		pending = subtle()
			.importKey('jwk', { ...jwk, ext: true }, ALGORITHM, false, ['verify'])
			.catch(() => null)
		imported.set(id, pending)
	}
	return pending
}

/** True only for a signature this exact body was signed with by this key. */
export const verifyFrame = async (
	publicJwk: PublicKeyJwk,
	body: SignedFrameBody,
	signature: string
): Promise<boolean> => {
	const key = await importPublic(publicJwk)
	const sig = fromBase64Url(signature)
	if (!key || !sig || sig.length !== 64) return false
	try {
		return await subtle().verify(SIGN, key, sig, bytesOf(body))
	} catch {
		return false
	}
}

/** Read a registered key back off a seat row; anything malformed is no key. */
export const parsePublicKey = (stored: unknown): PublicKeyJwk | null => {
	try {
		const value = typeof stored === 'string' ? (JSON.parse(stored) as unknown) : stored
		return isPublicKeyJwk(value) ? value : null
	} catch {
		return null
	}
}
