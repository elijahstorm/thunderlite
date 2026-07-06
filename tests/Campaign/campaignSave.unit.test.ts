// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
	computeSignature,
	loadSnapshot,
	saveSnapshot,
	clearSnapshot,
	type CampaignSnapshot,
} from '../../src/lib/Campaign/campaignSave'

/** A minimal in-memory `localStorage` so the helpers run headless. */
const makeStorage = (init: Record<string, string> = {}) => {
	const store = new Map<string, string>(Object.entries(init))
	return {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => void store.set(key, value),
		removeItem: (key: string) => void store.delete(key),
		store,
	}
}

/** A tiny 2x1 board with one unit and one building, enough to sign. */
const makeMap = (unitTeam = 0): MapObject =>
	({
		cols: 2,
		rows: 1,
		layers: {
			ground: [{ type: 3 }, { type: 3 }],
			sky: [],
			units: [{ type: 1, team: unitTeam, state: 0, health: 10 }, null],
			buildings: [null, { type: 2, team: 1 }],
		},
	}) as unknown as MapObject

const makeSnapshot = (signature: string, over: Partial<CampaignSnapshot> = {}): CampaignSnapshot => ({
	version: 1,
	signature,
	savedAt: 123,
	turnNumber: 3,
	currentTeam: 1,
	layers: {
		ground: [{ type: 3 }],
		sky: [],
		units: [null],
		buildings: [null],
	} as unknown as MapLayers,
	gameState: {
		players: [],
		currentTeam: 1,
		turnNumber: 3,
		actedTiles: [4, 5],
		phase: 'playing',
	},
	smoke: [[7, 2]],
	runner: { started: true, firedTurns: ['0:0'], conditionsFired: [false] },
	fogEnabled: true,
	speakerColors: { Rook: '#ff0000' },
	pointers: [3, 9],
	...over,
})

describe('computeSignature', () => {
	it('is stable for the same pristine board', () => {
		expect(computeSignature(makeMap(), 'lvl')).toBe(computeSignature(makeMap(), 'lvl'))
	})

	it('changes when the level id changes', () => {
		expect(computeSignature(makeMap(), 'a')).not.toBe(computeSignature(makeMap(), 'b'))
	})

	it('changes when the starting layout changes', () => {
		expect(computeSignature(makeMap(0), 'lvl')).not.toBe(computeSignature(makeMap(1), 'lvl'))
	})
})

describe('load / save / clear', () => {
	it('round-trips a saved snapshot when the signature matches', () => {
		const storage = makeStorage()
		const snap = makeSnapshot('sig-1')
		saveSnapshot('lvl', snap, storage)
		expect(loadSnapshot('lvl', 'sig-1', storage)).toEqual(snap)
	})

	it('discards a save whose signature no longer matches (level redesigned)', () => {
		const storage = makeStorage()
		saveSnapshot('lvl', makeSnapshot('old-sig'), storage)
		expect(loadSnapshot('lvl', 'new-sig', storage)).toBeNull()
	})

	it('does not resume a finished match', () => {
		const storage = makeStorage()
		const done = makeSnapshot('sig-1', {
			gameState: {
				players: [],
				currentTeam: 0,
				turnNumber: 9,
				actedTiles: [],
				phase: 'gameOver',
			},
		})
		saveSnapshot('lvl', done, storage)
		expect(loadSnapshot('lvl', 'sig-1', storage)).toBeNull()
	})

	it('ignores a save from a different schema version', () => {
		const storage = makeStorage()
		saveSnapshot('lvl', makeSnapshot('sig-1', { version: 999 }), storage)
		expect(loadSnapshot('lvl', 'sig-1', storage)).toBeNull()
	})

	it('clear removes the save', () => {
		const storage = makeStorage()
		saveSnapshot('lvl', makeSnapshot('sig-1'), storage)
		clearSnapshot('lvl', storage)
		expect(loadSnapshot('lvl', 'sig-1', storage)).toBeNull()
	})

	it('returns null when nothing is stored', () => {
		expect(loadSnapshot('lvl', 'sig-1', makeStorage())).toBeNull()
	})
})
