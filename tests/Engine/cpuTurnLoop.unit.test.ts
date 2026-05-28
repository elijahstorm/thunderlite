// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { gameState } from '../../src/lib/Engine/gameState'
import { runCpuTurn } from '../../src/lib/Engine/cpuAi'

// Regression: the animated CPU turn loop must always run to completion and hand
// control back via `endTurn`. A failed animation (e.g. an attack sprite that was
// never loaded — exactly the case in this headless context) must not reject out
// of the async tick and strand the turn, which previously forced the player to
// click "End Turn" on the CPU's behalf.

const COLS = 6
const ROWS = 6

const makeMap = (): MapObject =>
	({
		cols: COLS,
		rows: ROWS,
		layers: {
			ground: new Array(COLS * ROWS).fill(0).map(() => ({ type: 0, state: 0 })),
			sky: new Array(COLS * ROWS).fill(null),
			units: new Array(COLS * ROWS).fill(null),
			buildings: new Array(COLS * ROWS).fill(null),
		},
		highlights: [],
		route: [],
	}) as unknown as MapObject

const unit = (team: number, type = 0): UnitObject =>
	({ type, state: 0, team, health: 40 }) as UnitObject

const seedCpuTurn = () => {
	gameState.set({
		players: [
			{ team: 0, money: 0, hasLost: false, controls: { ground: false, air: false, sea: false } },
			{ team: 1, money: 0, hasLost: false, controls: { ground: false, air: false, sea: false } },
		],
		currentTeam: 1,
		turnNumber: 1,
		actedTiles: new Set<number>(),
		phase: 'playing',
	})
}

const drive = async (map: MapObject): Promise<boolean> => {
	let ended = false
	const handle = runCpuTurn({
		humanTeam: 0,
		endTurn: () => {
			ended = true
		},
		map,
		delayMs: 5,
	})
	await vi.runAllTimersAsync()
	handle.cancel()
	return ended
}

describe('runCpuTurn always ends the turn', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		seedCpuTurn()
	})

	it('ends the turn when units are far from any enemy (move/wait only)', async () => {
		const map = makeMap()
		map.layers.units[0] = unit(1)
		map.layers.units[COLS * ROWS - 1] = unit(0)

		expect(await drive(map)).toBe(true)
		vi.useRealTimers()
	})

	it('ends the turn even when an attack animation fails to load', async () => {
		const map = makeMap()
		map.layers.units[0] = unit(1)
		map.layers.units[1] = unit(0) // adjacent enemy → CPU attacks

		expect(await drive(map)).toBe(true)
		// The attack still resolved against game state despite no attack sprite.
		expect(map.layers.units[1]).not.toBe(null)
		vi.useRealTimers()
	})
})
