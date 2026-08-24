// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { gameState } from '../../src/lib/Engine/gameState'
import { runCpuTurn } from '../../src/lib/Engine/cpuAi'
import {
	animateHealthBar,
	HEALTH_BAR_ANIMATION_TIME,
	HEALTH_BAR_BACKSTOP_SLACK,
} from '../../src/lib/Engine/Animator/animator'

// Regression: a CPU side in an online room is played by exactly ONE client (the
// designated driver) and relayed to everyone else, who are not allowed to act for
// a seat that isn't theirs. So anything that can hang the driver's CPU turn hangs
// the whole match for every other player. A hidden browser tab does exactly that
// twice over: it suspends requestAnimationFrame outright (a health-bar ease
// awaited by the attack sequence would never resolve, and the commit that lives
// inside that sequence would never run), and it clamps setTimeout hard enough to
// drag a paced turn out to minutes.

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
			{ team: 0, money: 0, hasLost: false, controls: { ground: 0, air: 0, sea: 0 } },
			{ team: 1, money: 0, hasLost: false, controls: { ground: 0, air: 0, sea: 0 } },
		],
		currentTeam: 1,
		turnNumber: 1,
		actedTiles: new Set<number>(),
		phase: 'playing',
	} as unknown as Parameters<typeof gameState.set>[0])
}

describe('animateHealthBar survives a suspended animation clock', () => {
	afterEach(() => {
		vi.useRealTimers()
		delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame
	})

	it('resolves off the wall-clock backstop when no frame ever fires', async () => {
		vi.useFakeTimers()
		// A hidden tab: rAF accepts the request and never calls back.
		;(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = () => 1

		const target = unit(0)
		let resolved = false
		const eased = animateHealthBar(target, 40, 20, true).then(() => {
			resolved = true
		})

		await vi.advanceTimersByTimeAsync(HEALTH_BAR_ANIMATION_TIME + HEALTH_BAR_BACKSTOP_SLACK + 50)
		await eased

		expect(resolved).toBe(true)
		// The bar is parked at its real destination, not stranded mid-ease.
		expect(target.displayHealth).toBe(20)
	})
})

describe('runCpuTurn in a hidden tab', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		seedCpuTurn()
		;(globalThis as { document?: unknown }).document = { hidden: true }
	})

	afterEach(() => {
		vi.useRealTimers()
		delete (globalThis as { document?: unknown }).document
	})

	// Microtasks are the one scheduling primitive a background tab does not
	// throttle, so a hidden driver must not need a single timer to finish.
	const flushMicrotasks = async () => {
		for (let i = 0; i < 500; i++) await Promise.resolve()
	}

	it('runs the whole turn without waiting on a throttled timer', async () => {
		const map = makeMap()
		map.layers.units[0] = unit(1)
		map.layers.units[COLS * ROWS - 1] = unit(0)

		let ended = false
		const handle = runCpuTurn({
			humanTeam: 0,
			endTurn: () => {
				ended = true
			},
			map,
			// Deliberately long: if the turn still paced itself off timers, no amount
			// of microtask flushing would get it to the end.
			delayMs: 60_000,
		})

		await flushMicrotasks()
		handle.cancel()

		expect(ended).toBe(true)
		expect(vi.getTimerCount()).toBe(0)
	})

	it('resolves a CPU attack without the animated sequence', async () => {
		const map = makeMap()
		map.layers.units[0] = unit(1)
		map.layers.units[1] = unit(0) // adjacent enemy → CPU attacks

		const targetHealthBefore = map.layers.units[1]!.health

		let ended = false
		const handle = runCpuTurn({
			humanTeam: 0,
			endTurn: () => {
				ended = true
			},
			map,
			delayMs: 60_000,
		})

		await flushMicrotasks()
		handle.cancel()

		expect(ended).toBe(true)
		// The commit normally rides inside the animation sequencer; the fast path has
		// to land it too, or the attack would silently never happen.
		const target = map.layers.units[1]
		expect(target === null || (target.health ?? 0) < (targetHealthBefore ?? 0)).toBe(true)
	})
})
