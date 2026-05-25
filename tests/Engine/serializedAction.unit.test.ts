// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
	isValidSerializedAction,
	normalizeAction,
	type SerializedAction,
} from '../../src/lib/Engine/Interactor/serializedAction'

describe('isValidSerializedAction', () => {
	it('accepts each kind in the new union', () => {
		expect(isValidSerializedAction({ kind: 'move', from: 0, to: 1 })).toBe(true)
		expect(isValidSerializedAction({ kind: 'attack', from: 2, to: 5 })).toBe(true)
		expect(isValidSerializedAction({ kind: 'capture', tile: 4 })).toBe(true)
		expect(
			isValidSerializedAction({ kind: 'build', building: 3, unitType: 0 })
		).toBe(true)
		expect(
			isValidSerializedAction({ kind: 'build', building: 3, unitType: 0, direction: 1 })
		).toBe(true)
		expect(isValidSerializedAction({ kind: 'mine', tile: 9 })).toBe(true)
		expect(isValidSerializedAction({ kind: 'repair', tile: 6 })).toBe(true)
		expect(
			isValidSerializedAction({ kind: 'transport-load', transport: 1, passenger: 2 })
		).toBe(true)
		expect(
			isValidSerializedAction({ kind: 'transport-unload', transport: 1, tile: 3 })
		).toBe(true)
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
		expect(isValidSerializedAction({ kind: 'endTurn' })).toBe(false)
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
})
