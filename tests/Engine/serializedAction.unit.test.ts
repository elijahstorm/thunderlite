// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
	actionFingerprint,
	isValidSerializedAction,
	normalizeAction,
	type SerializedAction,
} from '../../src/lib/Engine/Interactor/serializedAction'

describe('isValidSerializedAction', () => {
	it('accepts each kind in the new union', () => {
		expect(isValidSerializedAction({ kind: 'move', from: 0, to: 1 })).toBe(true)
		expect(isValidSerializedAction({ kind: 'move', from: 0, to: 2, path: [0, 1, 2] })).toBe(true)
		expect(isValidSerializedAction({ kind: 'attack', from: 2, to: 5 })).toBe(true)
		expect(isValidSerializedAction({ kind: 'capture', tile: 4 })).toBe(true)
		expect(isValidSerializedAction({ kind: 'build', building: 3, unitType: 0 })).toBe(true)
		expect(isValidSerializedAction({ kind: 'build', building: 3, unitType: 0, direction: 1 })).toBe(
			true
		)
		expect(isValidSerializedAction({ kind: 'mine', tile: 9 })).toBe(true)
		expect(isValidSerializedAction({ kind: 'repair', tile: 6 })).toBe(true)
		expect(isValidSerializedAction({ kind: 'transport-load', transport: 1, passenger: 2 })).toBe(
			true
		)
		expect(isValidSerializedAction({ kind: 'transport-unload', transport: 1, tile: 3 })).toBe(true)
		expect(isValidSerializedAction({ kind: 'ship-out', tile: 4 })).toBe(true)
		expect(isValidSerializedAction({ kind: 'air-lift', tile: 4 })).toBe(true)
		expect(isValidSerializedAction({ kind: 'wait', tile: 7 })).toBe(true)
		expect(isValidSerializedAction({ kind: 'end-turn' })).toBe(true)
	})

	it('rejects malformed payloads', () => {
		expect(isValidSerializedAction(null)).toBe(false)
		expect(isValidSerializedAction(undefined)).toBe(false)
		expect(isValidSerializedAction('end-turn')).toBe(false)
		expect(isValidSerializedAction({})).toBe(false)
		expect(isValidSerializedAction({ kind: 'unknown' })).toBe(false)
		expect(isValidSerializedAction({ kind: 'move' })).toBe(false)
		expect(isValidSerializedAction({ kind: 'move', from: -1, to: 2 })).toBe(false)
		expect(isValidSerializedAction({ kind: 'attack', from: 1 })).toBe(false)
		expect(isValidSerializedAction({ kind: 'wait', tile: '5' })).toBe(false)
		expect(isValidSerializedAction({ kind: 'wait', tile: Number.NaN })).toBe(false)
		expect(isValidSerializedAction({ kind: 'tile', tile: 12 })).toBe(false)
		expect(isValidSerializedAction({ kind: 'ship-out' })).toBe(false)
		expect(isValidSerializedAction({ kind: 'air-lift', tile: -1 })).toBe(false)
		expect(isValidSerializedAction({ kind: 'endTurn' })).toBe(false)
	})

	/**
	 * The relayed walk route is what stops two clients showing the same tank taking
	 * two different roads, so it has to be a route: tiles, at least a step long,
	 * and actually joining the endpoints the move claims. Step adjacency isn't
	 * checkable here (no board, no column count) — the client re-checks that before
	 * animating — but everything that doesn't need a board is checked, and the array
	 * is bounded so a hand-rolled payload can't push an unbounded blob into the log.
	 */
	it('validates a relayed move route against the move it belongs to', () => {
		expect(isValidSerializedAction({ kind: 'move', from: 0, to: 2, path: [0, 1, 2] })).toBe(true)
		// Doesn't start where the move starts / doesn't end where it ends.
		expect(isValidSerializedAction({ kind: 'move', from: 0, to: 2, path: [1, 2] })).toBe(false)
		expect(isValidSerializedAction({ kind: 'move', from: 0, to: 2, path: [0, 1] })).toBe(false)
		// Not a route at all.
		expect(isValidSerializedAction({ kind: 'move', from: 0, to: 2, path: [] })).toBe(false)
		expect(isValidSerializedAction({ kind: 'move', from: 0, to: 0, path: [0] })).toBe(false)
		expect(isValidSerializedAction({ kind: 'move', from: 0, to: 2, path: '0,1,2' })).toBe(false)
		expect(isValidSerializedAction({ kind: 'move', from: 0, to: 2, path: [0, -1, 2] })).toBe(false)
		expect(isValidSerializedAction({ kind: 'move', from: 0, to: 2, path: [0, 1.5, 2] })).toBe(false)
		// Unbounded blob.
		const huge = [0, ...new Array(400).fill(1), 2]
		expect(isValidSerializedAction({ kind: 'move', from: 0, to: 2, path: huge })).toBe(false)
	})
})

/**
 * The dedupe key a client holds while its own action is out for relay, matched
 * against the echo that comes back. The echo has been through jsonb, which does
 * not preserve key order, so the key must not either — a plain `JSON.stringify`
 * missed the slot and the client re-applied its own move.
 */
describe('actionFingerprint', () => {
	it('is independent of key order', () => {
		const mine: SerializedAction = { kind: 'move', from: 3, to: 5, path: [3, 4, 5] }
		const echoed = { to: 5, path: [3, 4, 5], from: 3, kind: 'move' } as unknown as SerializedAction
		expect(actionFingerprint(echoed)).toBe(actionFingerprint(mine))
	})

	it('still separates different actions', () => {
		expect(actionFingerprint({ kind: 'move', from: 3, to: 5 })).not.toBe(
			actionFingerprint({ kind: 'move', from: 5, to: 3 })
		)
		// Two moves between the same endpoints by different roads are NOT the same
		// action to relay-dedupe; keeping them distinct is harmless (an unclaimed
		// slot is released when its relay settles) and conflating them is not.
		expect(actionFingerprint({ kind: 'move', from: 0, to: 2, path: [0, 1, 2] })).not.toBe(
			actionFingerprint({ kind: 'move', from: 0, to: 2, path: [0, 5, 2] })
		)
	})
})

describe('normalizeAction', () => {
	it('returns the action as-is when valid', () => {
		const action: SerializedAction = { kind: 'move', from: 0, to: 1 }
		expect(normalizeAction(action)).toEqual(action)
		expect(normalizeAction({ kind: 'end-turn' })).toEqual({ kind: 'end-turn' })
	})

	it('returns null for legacy or unrecognized shapes', () => {
		expect(normalizeAction(null)).toBeNull()
		expect(normalizeAction({ tile: 12 })).toBeNull()
		expect(normalizeAction({ kind: 'tile', tile: 12 })).toBeNull()
		expect(normalizeAction({ kind: 'endTurn' })).toBeNull()
		expect(normalizeAction({ foo: 'bar' })).toBeNull()
		expect(normalizeAction('hello')).toBeNull()
	})
})

describe('SerializedAction JSON round-trip', () => {
	it('survives a JSON encode/decode pair', () => {
		const original: SerializedAction = { kind: 'attack', from: 4, to: 12 }
		const round = JSON.parse(JSON.stringify(original))
		expect(isValidSerializedAction(round)).toBe(true)
		expect(round).toEqual(original)
	})

	it('carries a move route intact', () => {
		const original: SerializedAction = { kind: 'move', from: 4, to: 6, path: [4, 5, 6] }
		const round = JSON.parse(JSON.stringify(original))
		expect(isValidSerializedAction(round)).toBe(true)
		expect(round).toEqual(original)
	})
})
