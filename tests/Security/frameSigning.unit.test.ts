// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
	canonicalize,
	generateSigningKey,
	isPublicKeyJwk,
	parsePublicKey,
	signFrame,
	verifyFrame,
	type SignedFrameBody,
} from '../../src/lib/Security/frameSigning'

const body: SignedFrameBody = {
	session: 'room-1',
	sender: 'host-session',
	turn: 412,
	index: 3,
	action: { kind: 'move', from: 13, to: 15, path: [13, 14, 15] },
}

describe('frame signing', () => {
	it('canonicalises regardless of key order, dropping undefined', () => {
		const a = canonicalize({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: 'x' }, u: undefined })
		const b = canonicalize({ a: { c: 'x', d: [1, { y: 2, z: 1 }] }, b: 1 })
		expect(a).toBe(b)
		expect(a).toBe('{"a":{"c":"x","d":[1,{"y":2,"z":1}]},"b":1}')
	})

	it('round-trips a signature under the matching public key', async () => {
		const key = await generateSigningKey()
		const sig = await signFrame(key.privateKey, body)
		expect(await verifyFrame(key.publicJwk, body, sig)).toBe(true)
	})

	it('rejects a tampered body, a wrong slot, and another room', async () => {
		const key = await generateSigningKey()
		const sig = await signFrame(key.privateKey, body)
		expect(
			await verifyFrame(
				key.publicJwk,
				{ ...body, action: { ...(body.action as object), to: 16 } },
				sig
			)
		).toBe(false)
		expect(await verifyFrame(key.publicJwk, { ...body, index: 4 }, sig)).toBe(false)
		expect(await verifyFrame(key.publicJwk, { ...body, turn: 413 }, sig)).toBe(false)
		expect(await verifyFrame(key.publicJwk, { ...body, session: 'room-2' }, sig)).toBe(false)
		expect(await verifyFrame(key.publicJwk, { ...body, sender: 'someone-else' }, sig)).toBe(false)
	})

	it('rejects another player’s key and garbage signatures', async () => {
		const mine = await generateSigningKey()
		const theirs = await generateSigningKey()
		const sig = await signFrame(mine.privateKey, body)
		expect(await verifyFrame(theirs.publicJwk, body, sig)).toBe(false)
		expect(await verifyFrame(mine.publicJwk, body, 'not-a-signature')).toBe(false)
		expect(await verifyFrame(mine.publicJwk, body, '')).toBe(false)
	})

	it('accepts a registered key back from text and refuses malformed ones', async () => {
		const key = await generateSigningKey()
		expect(isPublicKeyJwk(key.publicJwk)).toBe(true)
		expect(parsePublicKey(JSON.stringify(key.publicJwk))).toEqual(key.publicJwk)
		expect(parsePublicKey('{"kty":"RSA"}')).toBeNull()
		expect(parsePublicKey({ kty: 'EC', crv: 'P-256', x: 'short', y: 'short' })).toBeNull()
		expect(parsePublicKey(null)).toBeNull()
	})
})
