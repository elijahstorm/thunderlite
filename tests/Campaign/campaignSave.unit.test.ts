// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
	applySnapshot,
	captureSnapshot,
	computeSignature,
	loadSnapshot,
	saveSnapshot,
	clearSnapshot,
	CAMPAIGN_SAVE_VERSION,
	type CampaignSnapshot,
} from '../../src/lib/Campaign/campaignSave'
import { currentMatchSeed, setMatchSeed } from '../../src/lib/Engine/matchSeed'

/**
 * The schema version `captureSnapshot` writes today. Read off a real capture so
 * this file does not have to be edited every time the shape moves; the "old save
 * is rejected" test below pins the behaviour, not a specific number.
 */
const CURRENT_VERSION = CAMPAIGN_SAVE_VERSION

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

const makeSnapshot = (
	signature: string,
	over: Partial<CampaignSnapshot> = {}
): CampaignSnapshot => ({
	version: CURRENT_VERSION,
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
	seed: 0x1234abcd,
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

describe('match seed', () => {
	it('captures the seed the attempt is being played under', () => {
		setMatchSeed(0xfeed1234)
		expect(captureSnapshot(makeMap(), 'sig', null).seed).toBe(0xfeed1234)
	})

	it('re-installs the saved seed on resume, so Continue is the same match', () => {
		setMatchSeed(0xaaaaaaaa)
		const snap = captureSnapshot(makeMap(), 'sig', null)
		// Simulate the reload: a fresh mount rolls its own seed before the player
		// chooses Continue.
		setMatchSeed(0xbbbbbbbb)
		applySnapshot(makeMap(), snap)
		expect(currentMatchSeed()).toBe(0xaaaaaaaa)
	})

	it('rejects a pre-seed save rather than resuming under a rolled one', () => {
		const storage = makeStorage()
		// A v1 snapshot has no seed; resuming it would silently hand the player a
		// different match than the one they left.
		saveSnapshot('lvl', makeSnapshot('sig-1', { version: 1 }), storage)
		expect(loadSnapshot('lvl', 'sig-1', storage)).toBeNull()
	})
})
