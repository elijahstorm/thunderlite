/**
 * campaignRunner — executes a parsed cutscene script (K1) against a live game.
 *
 * The runner is pure orchestration: it walks the ordered events of a block and
 * pushes each one to an injected {@link CampaignInterface}. It knows nothing
 * about the renderer, the Scroller, the dialogue DOM, or the engine's mutation
 * functions — those live behind the interface. That keeps the runner headless
 * (per the mission's "game-logic modules must run headless" rule): vitest drives
 * it through a recording fake and asserts the engine ops fire in order.
 *
 * Block timing is owned by the caller (the Svelte mount), which calls:
 *   - `start()` once on level load,
 *   - `enterTurn(round, team)` at the start of every side-turn (fires
 *     `turns[round][team]` once),
 *   - `finish(result)` off the J1 match-end hook (win or lose block).
 */

import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import type { CompareOp, CutsceneEvent, CutsceneScript } from './cutsceneTypes'

/** A value that may be produced synchronously or asynchronously. */
type MaybePromise<T> = T | Promise<T>

/** The minimal map slice `<when>` conditions read: each layer's team/type. */
export interface ConditionMap {
	layers: {
		units: ReadonlyArray<{ team: number; type: number } | null>
		buildings: ReadonlyArray<{ team: number; type: number } | null>
	}
}

const compareCount = (n: number, op: CompareOp, k: number): boolean =>
	op === '<' ? n < k : op === '<=' ? n <= k : op === '==' ? n === k : op === '>=' ? n >= k : n > k

/**
 * The side-effecting surface the runner drives. Every method may return a
 * promise; the runner awaits each so a `wait` or a `talk` (which blocks on the
 * player advancing the dialogue) pauses the sequence without the runner needing
 * to know how the pause is implemented.
 */
export interface CampaignInterface {
	/** Pan the camera to a tile. */
	camera(x: number, y: number): MaybePromise<void>
	/** Highlight a tile (tutorial pointer). */
	highlight(x: number, y: number): MaybePromise<void>
	/** Remove a tile highlight. */
	unhighlight(x: number, y: number): MaybePromise<void>
	/** Show one speaker's lines; resolves once the player advances past the last. */
	talk(speaker: string, lines: string[]): MaybePromise<void>
	/** Set a speaker's dialogue colour (CSS colour) for the rest of the level. */
	setSpeakerColor(speaker: string, color: string): MaybePromise<void>
	/** Spawn a unit for a team at a tile. */
	spawn(team: number, unit: string, x: number, y: number): MaybePromise<void>
	/** Remove whatever unit occupies a tile. */
	kill(x: number, y: number): MaybePromise<void>
	/** Set the current health of the unit at a tile (clamped to 1..max; never kills). */
	hurt(x: number, y: number, health: number): MaybePromise<void>
	/** Replace the terrain at a tile. */
	setTerrain(terrain: string, x: number, y: number): MaybePromise<void>
	/** Set the weather/sky at a tile. */
	setWeather(weather: string, x: number, y: number): MaybePromise<void>
	/** Clear the weather/sky at a tile. */
	clearWeather(x: number, y: number): MaybePromise<void>
	/** Turn fog of war on or off for the rest of the match. */
	fog(on: boolean): MaybePromise<void>
	/** Add (or, when negative, subtract) funds for a team. */
	funds(team: number, amount: number): MaybePromise<void>
	/** Place a building for a team at a tile. */
	addBuilding(team: number, building: string, x: number, y: number): MaybePromise<void>
	/** Remove whatever building occupies a tile. */
	removeBuilding(x: number, y: number): MaybePromise<void>
	/** Change the owning team of the building at a tile. */
	ownBuilding(team: number, x: number, y: number): MaybePromise<void>
	/** End the match immediately as a defeat for the local player. */
	defeat(): MaybePromise<void>
	/** Timed pause for `seconds`. */
	wait(seconds: number): MaybePromise<void>
	/**
	 * Called once before a block's events run. Lets the impl reset per-block state
	 * (e.g. clear the "skip rest of dialogue" flag the Skip button sets). Optional
	 * so headless test fakes can omit it.
	 */
	beginBlock?(): MaybePromise<void>
	/**
	 * Commit any batched visual state the block accumulated (e.g. a run of
	 * `setTerrain` calls coalesces into a single repaint so terrain connections
	 * recompute once). Called at the end of every block; optional so headless
	 * test fakes can omit it.
	 */
	flush?(): MaybePromise<void>
}

/**
 * The minimal slice of a J1 `MatchResult` the runner needs to choose win vs
 * lose. A full `MatchResult` is structurally assignable to this, so the Svelte
 * mount can pass the hook payload straight through without the runner importing
 * (and thus depending on) the engine's match-end module.
 */
export interface CampaignOutcome {
	players: { isLocal: boolean; outcome: 'win' | 'loss' | 'draw' }[]
}

/** Run one block's events in order, awaiting each before the next. */
export const runCutsceneEvents = async (
	events: readonly CutsceneEvent[],
	iface: CampaignInterface
): Promise<void> => {
	// Let the impl reset per-block state (e.g. the dialogue skip flag) so a Skip
	// in one block never silences the next.
	await iface.beginBlock?.()
	for (const event of events) {
		await dispatchEvent(event, iface)
	}
	// Flush any visual changes the block batched (terrain repaints, etc.) so they
	// land before control returns to the player, even if the block never paused.
	await iface.flush?.()
}

/** Route a single event to its interface method. */
const dispatchEvent = (event: CutsceneEvent, iface: CampaignInterface): MaybePromise<void> => {
	switch (event.kind) {
		case 'talk':
			return iface.talk(event.speaker, event.lines)
		case 'speakerColor':
			return iface.setSpeakerColor(event.speaker, event.color)
		case 'camera':
			return iface.camera(event.x, event.y)
		case 'highlight':
			return iface.highlight(event.x, event.y)
		case 'unhighlight':
			return iface.unhighlight(event.x, event.y)
		case 'spawn':
			return iface.spawn(event.team, event.unit, event.x, event.y)
		case 'kill':
			return iface.kill(event.x, event.y)
		case 'hurt':
			return iface.hurt(event.x, event.y, event.health)
		case 'setTerrain':
			return iface.setTerrain(event.terrain, event.x, event.y)
		case 'setWeather':
			return iface.setWeather(event.weather, event.x, event.y)
		case 'clearWeather':
			return iface.clearWeather(event.x, event.y)
		case 'fog':
			return iface.fog(event.on)
		case 'funds':
			return iface.funds(event.team, event.amount)
		case 'addBuilding':
			return iface.addBuilding(event.team, event.building, event.x, event.y)
		case 'removeBuilding':
			return iface.removeBuilding(event.x, event.y)
		case 'ownBuilding':
			return iface.ownBuilding(event.team, event.x, event.y)
		case 'defeat':
			return iface.defeat()
		case 'wait':
			return iface.wait(event.seconds)
	}
}

/** True when the local player won (anything else — loss/draw — plays `lose`). */
const localPlayerWon = (outcome: CampaignOutcome): boolean =>
	outcome.players.find((p) => p.isLocal)?.outcome === 'win'

/**
 * The runner's "which blocks have already fired" state, flat and JSON-safe so a
 * campaign save can persist it and a refresh can restore it — otherwise a resumed
 * level would replay the opening cutscene and any already-played turn/`<when>`
 * blocks. `conditionsFired` is positional, matching `script.conditions` order.
 */
export interface CampaignRunnerState {
	started: boolean
	firedTurns: string[]
	conditionsFired: boolean[]
}

export interface CampaignRunner {
	/** Play the `start` block once. Subsequent calls are no-ops. */
	start(): Promise<void>
	/**
	 * Play `turns[round][team]` once, the first time that side-turn begins.
	 * Both indices are zero-based.
	 */
	enterTurn(round: number, team: number): Promise<void>
	/** Play `win` or `lose` once, chosen from the match-end result. */
	finish(outcome: CampaignOutcome): Promise<void>
	/** True once a win/lose block has played. */
	hasFinished(): boolean
	/** Whether any unfired `<when>` block's condition currently holds (no side effects). */
	hasPendingConditions(map: ConditionMap): boolean
	/** Fire every unfired `<when>` block whose condition now holds, each once. */
	checkConditions(map: ConditionMap): Promise<void>
	/** Snapshot which blocks have fired, for a campaign save. */
	serialize(): CampaignRunnerState
	/** Restore fired-state from a save so a resumed level doesn't replay blocks. */
	restore(state: CampaignRunnerState): void
}

/**
 * Bind a parsed script to an interface. The returned runner is stateful only in
 * the "play each block at most once" sense — it never mutates the script and
 * holds no engine references.
 */
export const createCampaignRunner = (
	script: CutsceneScript,
	iface: CampaignInterface
): CampaignRunner => {
	let started = false
	let finished = false
	const firedTurns = new Set<string>()

	// Resolve each `<when>` block's type names to indices on its layer (units or
	// buildings) once, and track whether it has already fired.
	const conditions = script.conditions.map((block) => {
		const table = block.condition.layer === 'buildings' ? buildingData : unitData
		return {
			...block,
			typeIdx: block.condition.typeNames
				? new Set(block.condition.typeNames.map((name) => table.findIndex((e) => e.name === name)))
				: null,
			fired: false,
		}
	})

	type ResolvedCondition = (typeof conditions)[number]
	const holds = (c: ResolvedCondition, map: ConditionMap): boolean => {
		let n = 0
		const layer = c.condition.layer === 'buildings' ? map.layers.buildings : map.layers.units
		for (const entry of layer) {
			if (!entry || entry.team !== c.condition.team) continue
			if (c.typeIdx && !c.typeIdx.has(entry.type)) continue
			n++
		}
		return compareCount(n, c.condition.op, c.condition.count)
	}

	return {
		start: async () => {
			if (started) return
			started = true
			await runCutsceneEvents(script.start, iface)
		},
		enterTurn: async (round, team) => {
			if (finished) return
			const key = `${round}:${team}`
			if (firedTurns.has(key)) return
			firedTurns.add(key)
			const block = script.turns[round]?.[team]
			if (block) await runCutsceneEvents(block, iface)
		},
		finish: async (outcome) => {
			if (finished) return
			finished = true
			await runCutsceneEvents(localPlayerWon(outcome) ? script.win : script.lose, iface)
		},
		hasFinished: () => finished,
		serialize: () => ({
			started,
			firedTurns: [...firedTurns],
			conditionsFired: conditions.map((c) => c.fired),
		}),
		restore: (state) => {
			started = state.started
			firedTurns.clear()
			for (const key of state.firedTurns) firedTurns.add(key)
			state.conditionsFired.forEach((fired, i) => {
				if (conditions[i]) conditions[i].fired = fired
			})
		},
		hasPendingConditions: (map) => !finished && conditions.some((c) => !c.fired && holds(c, map)),
		checkConditions: async (map) => {
			if (finished) return
			for (const c of conditions) {
				if (c.fired || !holds(c, map)) continue
				c.fired = true
				await runCutsceneEvents(c.events, iface)
				// A `defeat` in the block ends the match; stop firing further conditions.
				if (finished) break
			}
		},
	}
}
