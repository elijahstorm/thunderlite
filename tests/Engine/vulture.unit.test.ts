// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import { gameState, resetGameState, markTileActed } from '../../src/lib/Engine/gameState'
import { applyVultureKill } from '../../src/lib/Engine/modifiers/vulture'
import { unitData } from '../../src/lib/GameData/unit'

const VULTURE_TYPE = unitData.findIndex((u) => u.name === 'Vulture Drone')
const NON_VULTURE_TYPE = unitData.findIndex((u) => u.name === 'Strike Commando')

const makeVulture = (team = 0): UnitObject => ({
	type: VULTURE_TYPE,
	state: 0,
	team,
})

const makeNonVulture = (team = 0): UnitObject => ({
	type: NON_VULTURE_TYPE,
	state: 0,
	team,
})

const setTurn = (turnNumber: number) => {
	gameState.update((state) => ({ ...state, turnNumber }))
}

describe('Vulture — move again on kill', () => {
	beforeEach(() => {
		resetGameState()
	})

	it('sanity: lookup of Vulture Drone in unit data is valid', () => {
		expect(VULTURE_TYPE).toBeGreaterThanOrEqual(0)
		expect(unitData[VULTURE_TYPE].modifiers).toContain('End_Turn.Vulture')
	})

	it('on kill, un-acts the Vulture so it can be selected again this turn', () => {
		const vulture = makeVulture()
		const tile = 5
		markTileActed(tile)
		expect(get(gameState).actedTiles.has(tile)).toBe(true)

		const granted = applyVultureKill(vulture, tile)

		expect(granted).toBe(true)
		expect(get(gameState).actedTiles.has(tile)).toBe(false)
	})

	it('does nothing for non-Vulture units (target survived path is unaffected)', () => {
		const grunt = makeNonVulture()
		const tile = 3
		markTileActed(tile)

		const granted = applyVultureKill(grunt, tile)

		expect(granted).toBe(false)
		expect(get(gameState).actedTiles.has(tile)).toBe(true)
	})

	it('re-action is one-shot: a second kill on the same turn does not grant another bonus', () => {
		const vulture = makeVulture()

		// First kill at tile 5
		markTileActed(5)
		expect(applyVultureKill(vulture, 5)).toBe(true)
		expect(get(gameState).actedTiles.has(5)).toBe(false)

		// Vulture moves and kills again, this time at tile 8.
		// Normal rules apply: the tile is marked acted, and the bonus is not re-granted.
		markTileActed(8)
		const grantedAgain = applyVultureKill(vulture, 8)

		expect(grantedAgain).toBe(false)
		expect(get(gameState).actedTiles.has(8)).toBe(true)
	})

	it('grants the bonus again on a new turn', () => {
		const vulture = makeVulture()

		markTileActed(5)
		expect(applyVultureKill(vulture, 5)).toBe(true)

		setTurn(get(gameState).turnNumber + 1)

		markTileActed(7)
		expect(applyVultureKill(vulture, 7)).toBe(true)
		expect(get(gameState).actedTiles.has(7)).toBe(false)
	})
})
