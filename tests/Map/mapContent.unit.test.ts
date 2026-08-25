import { describe, it, expect } from 'vitest'
import { mapHasher, deriveFromHash } from '../../src/lib/Map/Editor/mapExporter'
import { canResumeInMemoryMap, placeableCount, wouldWipeBoard } from '../../src/lib/Map/mapContent'

/**
 * A blank 10x10 grass board — what the editor hands a brand-new map.
 *
 * `deriveFromHash(undefined)` shallow-spreads the module-level empty template, so
 * the returned board SHARES its layer arrays. Round-trip through the hash (the
 * same trick the editor's `freshEmptyMap` uses) to get independent arrays these
 * helpers can safely paint on.
 */
const blankBoard = () => deriveFromHash(mapHasher(deriveFromHash(undefined)))

const blankHash = () => mapHasher(blankBoard())

/** The same board with one unit and one building placed. */
const playableHash = () => {
	const map = blankBoard()
	map.layers.units[20] = { type: 0, team: 0, state: 0 } as never
	map.layers.buildings[40] = { type: 4, team: 0, state: 0 } as never
	return mapHasher(map)
}

describe('placeableCount', () => {
	it('counts units and buildings on a board', () => {
		expect(placeableCount(playableHash())).toBe(2)
	})

	it('reports zero for a board that is only terrain', () => {
		expect(placeableCount(blankHash())).toBe(0)
	})

	it('reports null — not zero — for a blob it cannot decode', () => {
		// Callers must be able to tell "empty" from "unreadable": refusing a save we
		// merely failed to parse would be worse than accepting it.
		expect(placeableCount('!!! not base62 !!!')).toBeNull()
	})
})

describe('wouldWipeBoard', () => {
	it('refuses a blank board over a board that has pieces', () => {
		expect(wouldWipeBoard(blankHash(), playableHash())).toBe(true)
	})

	it('allows a normal save', () => {
		expect(wouldWipeBoard(playableHash(), playableHash())).toBe(false)
	})

	it('allows a blank save over an already-blank map', () => {
		expect(wouldWipeBoard(blankHash(), blankHash())).toBe(false)
	})

	it('allows the save when there is nothing stored yet', () => {
		expect(wouldWipeBoard(blankHash(), null)).toBe(false)
	})

	it('allows the save when the stored blob cannot be decoded', () => {
		expect(wouldWipeBoard(blankHash(), 'garbage!')).toBe(false)
	})
})

describe('canResumeInMemoryMap', () => {
	it('resumes on the bare /editor route, whatever the board is linked to', () => {
		expect(
			canResumeInMemoryMap({ hasStoredMap: true, routeMapId: undefined, storedMapId: 'abc' })
		).toBe(true)
	})

	it('resumes when the in-memory board is this route’s map', () => {
		expect(
			canResumeInMemoryMap({ hasStoredMap: true, routeMapId: 'abc', storedMapId: 'abc' })
		).toBe(true)
	})

	it('refuses a board belonging to a different map', () => {
		// The regression: a blank `/editor` board reached `/editor/abc` through the
		// bare route's client-side goto, adopted `abc` as its id, and the next Save
		// overwrote map `abc` with it.
		expect(
			canResumeInMemoryMap({ hasStoredMap: true, routeMapId: 'abc', storedMapId: 'xyz' })
		).toBe(false)
	})

	it('refuses a board with no id at all on an id route', () => {
		expect(
			canResumeInMemoryMap({ hasStoredMap: true, routeMapId: 'abc', storedMapId: undefined })
		).toBe(false)
	})

	it('has nothing to resume when the store is empty', () => {
		expect(
			canResumeInMemoryMap({ hasStoredMap: false, routeMapId: undefined, storedMapId: undefined })
		).toBe(false)
	})
})
