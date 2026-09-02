// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
	animateBlocked,
	blockedAnimation,
	boardBusy,
	clearAnimations,
	isOrthogonalStep,
} from '../../src/lib/Engine/Animator/animator'
import { animateRemoteAction } from '../../src/lib/Engine/remoteAnimate'
import {
	hasRemoteChoreography,
	remoteChoreographyMs,
} from '../../src/lib/Engine/remoteChoreography'
import { ANIMATION_TIME, BLOCKED_ANIMATION_TIME } from '../../src/lib/Engine/Animator/timings'
import { resetGameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import { unitData } from '../../src/lib/GameData/unit'
import { terrainData } from '../../src/lib/GameData/terrain'

const SCORPION_TANK = unitData.findIndex((u) => u.name === 'Scorpion Tank')
const PLAINS = terrainData.findIndex((t) => t.name === 'Plains')

const COLS = 5

const makeMap = (): MapObject =>
	({
		cols: COLS,
		rows: 5,
		layers: {
			ground: new Array(25).fill(0).map(() => ({ type: PLAINS, state: 0 })),
			sky: new Array(25).fill(null),
			units: new Array(25).fill(null),
			buildings: new Array(25).fill(null),
		},
		highlights: [],
		route: [],
		pathHistory: [],
		filters: {} as any,
	}) as MapObject

const tank = (team: number): UnitObject => ({
	type: SCORPION_TANK,
	state: 0,
	team,
	health: unitData[SCORPION_TANK].health,
})

/** Every value the blocked-beat store takes while a promise settles. */
const recordBumps = () => {
	const seen: { tile: number; blocked: number; direction: number; animating?: boolean }[] = []
	const stop = blockedAnimation.subscribe((value) => {
		if (value)
			seen.push({
				tile: value.tile,
				blocked: value.blocked,
				direction: value.direction,
				animating: value.unit.animating,
			})
	})
	return { seen, stop }
}

let busy = false
let stopBusy: (() => void) | null = null

/**
 * A move that walks into an enemy it couldn't see halts a tile short. The halt
 * alone is unreadable from the other side of the board — the ambusher sees an
 * enemy stroll up to their hidden unit and stop — so the mover plays a "blocked"
 * beat: it faces the tile it hit, lunges at it and a callout pops. The action
 * carries that tile so every client plays the same beat.
 */
describe('blocked move choreography', () => {
	beforeEach(() => {
		resetGameState()
		stopBusy = boardBusy.subscribe((value) => (busy = value))
	})
	afterEach(() => {
		stopBusy?.()
		clearAnimations()
	})

	it('faces the blocked tile, hides the idle sprite, and holds the board busy for the beat', async () => {
		const map = makeMap()
		const unit = tank(0)
		map.layers.units[12] = unit
		map.layers.units[13] = tank(1)
		const { seen, stop } = recordBumps()

		const started = Date.now()
		const beat = animateBlocked(map, unit, 12, 13)
		expect(busy).toBe(true)
		expect(unit.animating).toBe(true)
		// 12 -> 13 is a step to the right: facing 0.
		expect(unit.state).toBe(0)
		await beat
		stop()

		expect(seen).toEqual([{ tile: 12, blocked: 13, direction: 0, animating: true }])
		expect(unit.animating).toBe(false)
		expect(busy).toBe(false)
		expect(Date.now() - started).toBeGreaterThanOrEqual(BLOCKED_ANIMATION_TIME - 20)
	})

	it('plays nothing for a blocked tile that is not an orthogonal neighbour', async () => {
		const map = makeMap()
		const unit = tank(0)
		map.layers.units[12] = unit
		const { seen, stop } = recordBumps()

		// Diagonal, distant, and a +1 that wraps the row edge (9 -> 10).
		await animateBlocked(map, unit, 12, 18)
		await animateBlocked(map, unit, 12, 0)
		map.layers.units[9] = unit
		await animateBlocked(map, unit, 9, 10)
		stop()

		expect(seen).toEqual([])
		expect(unit.animating).toBeUndefined()
		expect(isOrthogonalStep(map, 9, 10)).toBe(false)
		expect(isOrthogonalStep(map, 12, 13)).toBe(true)
		expect(isOrthogonalStep(map, 12, 7)).toBe(true)
	})

	it('a relayed move that was cut short ends on the lunge at the tile it hit', async () => {
		const map = makeMap()
		const mover = tank(1)
		map.layers.units[12] = mover
		// Our own unit, sitting where the enemy's route was heading.
		map.layers.units[8] = tank(0)
		initGameStateFromMap(map)
		const { seen, stop } = recordBumps()

		// Planned 12 -> 13 -> 8; walked 12 -> 13 and ran into 8.
		await animateRemoteAction(map, {
			kind: 'move',
			from: 12,
			to: 13,
			path: [12, 13],
			blocked: 8,
		})
		stop()

		expect(map.layers.units[13]).toBe(mover)
		expect(map.layers.units[12]).toBeNull()
		// 13 -> 8 is a step up: facing 3.
		expect(seen).toEqual([{ tile: 13, blocked: 8, direction: 3, animating: true }])
		expect(mover.state).toBe(3)
		expect(mover.animating).toBe(false)
	})

	it('a relayed wait that stands for a move stopped on its first step lunges in place', async () => {
		const map = makeMap()
		const mover = tank(1)
		map.layers.units[12] = mover
		map.layers.units[17] = tank(0)
		initGameStateFromMap(map)
		const { seen, stop } = recordBumps()

		await animateRemoteAction(map, { kind: 'wait', tile: 12, blocked: 17 })
		stop()

		expect(map.layers.units[12]).toBe(mover)
		// 12 -> 17 is a step down: facing 1.
		expect(seen).toEqual([{ tile: 12, blocked: 17, direction: 1, animating: true }])
	})

	it('a plain wait stays instant and silent', async () => {
		const map = makeMap()
		map.layers.units[12] = tank(1)
		initGameStateFromMap(map)
		const { seen, stop } = recordBumps()

		await animateRemoteAction(map, { kind: 'wait', tile: 12 })
		stop()

		expect(seen).toEqual([])
	})

	it('the event queue budgets the beat and knows a blocked wait has something to show', () => {
		expect(hasRemoteChoreography({ kind: 'wait', tile: 3 })).toBe(false)
		expect(hasRemoteChoreography({ kind: 'wait', tile: 3, blocked: 4 })).toBe(true)
		expect(remoteChoreographyMs({ kind: 'wait', tile: 3 })).toBe(0)
		expect(remoteChoreographyMs({ kind: 'wait', tile: 3, blocked: 4 })).toBe(BLOCKED_ANIMATION_TIME)
		expect(remoteChoreographyMs({ kind: 'move', from: 0, to: 2, path: [0, 1, 2] })).toBe(
			2 * ANIMATION_TIME
		)
		expect(
			remoteChoreographyMs({ kind: 'move', from: 0, to: 2, path: [0, 1, 2], blocked: 3 })
		).toBe(2 * ANIMATION_TIME + BLOCKED_ANIMATION_TIME)
	})
})
