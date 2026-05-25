// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
	isValidSerializedAction,
	normalizeAction,
	type SerializedAction,
} from '../../src/lib/Engine/Interactor/serializedAction'

describe('isValidSerializedAction', () => {
	it('accepts a tile action with a non-negative integer tile', () => {
		expect(isValidSerializedAction({ kind: 'tile', tile: 0 })).toBe(true)
		expect(isValidSerializedAction({ kind: 'tile', tile: 42 })).toBe(true)
	})

	it('accepts an endTurn action', () => {
		expect(isValidSerializedAction({ kind: 'endTurn' })).toBe(true)
	})

	it('rejects malformed payloads', () => {
		expect(isValidSerializedAction(null)).toBe(false)
		expect(isValidSerializedAction(undefined)).toBe(false)
		expect(isValidSerializedAction('endTurn')).toBe(false)
		expect(isValidSerializedAction({})).toBe(false)
		expect(isValidSerializedAction({ kind: 'unknown' })).toBe(false)
		expect(isValidSerializedAction({ kind: 'tile' })).toBe(false)
		expect(isValidSerializedAction({ kind: 'tile', tile: -1 })).toBe(false)
		expect(isValidSerializedAction({ kind: 'tile', tile: '5' })).toBe(false)
		expect(isValidSerializedAction({ kind: 'tile', tile: Number.NaN })).toBe(false)
	})
})

describe('normalizeAction', () => {
	it('returns the action as-is when valid', () => {
		const action: SerializedAction = { kind: 'tile', tile: 7 }
		expect(normalizeAction(action)).toEqual(action)
		expect(normalizeAction({ kind: 'endTurn' })).toEqual({ kind: 'endTurn' })
	})

	it('upgrades legacy {tile} payloads to SerializedAction', () => {
		expect(normalizeAction({ tile: 12 })).toEqual({ kind: 'tile', tile: 12 })
	})

	it('returns null for anything unrecognized', () => {
		expect(normalizeAction(null)).toBeNull()
		expect(normalizeAction({ tile: -3 })).toBeNull()
		expect(normalizeAction({ foo: 'bar' })).toBeNull()
		expect(normalizeAction('hello')).toBeNull()
	})
})

describe('SerializedAction JSON round-trip', () => {
	it('survives a JSON encode/decode pair', () => {
		const original: SerializedAction = { kind: 'tile', tile: 99 }
		const round = JSON.parse(JSON.stringify(original))
		expect(isValidSerializedAction(round)).toBe(true)
		expect(round).toEqual(original)
	})
})
