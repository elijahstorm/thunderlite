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
 *   - `enterTurn(n)` at the start of turn n (fires `turns[n]` once),
 *   - `finish(result)` off the J1 match-end hook (win or lose block).
 */

import type { CutsceneEvent, CutsceneScript } from './cutsceneTypes'

/** A value that may be produced synchronously or asynchronously. */
type MaybePromise<T> = T | Promise<T>

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
	/** Spawn a unit for a team at a tile. */
	spawn(team: number, unit: string, x: number, y: number): MaybePromise<void>
	/** Remove whatever unit occupies a tile. */
	kill(x: number, y: number): MaybePromise<void>
	/** Replace the terrain at a tile. */
	setTerrain(terrain: string, x: number, y: number): MaybePromise<void>
	/** Timed pause for `seconds`. */
	wait(seconds: number): MaybePromise<void>
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
	for (const event of events) {
		await dispatchEvent(event, iface)
	}
}

/** Route a single event to its interface method. */
const dispatchEvent = (event: CutsceneEvent, iface: CampaignInterface): MaybePromise<void> => {
	switch (event.kind) {
		case 'talk':
			return iface.talk(event.speaker, event.lines)
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
		case 'setTerrain':
			return iface.setTerrain(event.terrain, event.x, event.y)
		case 'wait':
			return iface.wait(event.seconds)
	}
}

/** True when the local player won (anything else — loss/draw — plays `lose`). */
const localPlayerWon = (outcome: CampaignOutcome): boolean =>
	outcome.players.find((p) => p.isLocal)?.outcome === 'win'

export interface CampaignRunner {
	/** Play the `start` block once. Subsequent calls are no-ops. */
	start(): Promise<void>
	/** Play `turns[turn]` once, the first time turn `turn` begins. */
	enterTurn(turn: number): Promise<void>
	/** Play `win` or `lose` once, chosen from the match-end result. */
	finish(outcome: CampaignOutcome): Promise<void>
	/** True once a win/lose block has played. */
	hasFinished(): boolean
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
	const firedTurns = new Set<number>()

	return {
		start: async () => {
			if (started) return
			started = true
			await runCutsceneEvents(script.start, iface)
		},
		enterTurn: async (turn) => {
			if (finished) return
			if (firedTurns.has(turn)) return
			firedTurns.add(turn)
			const block = script.turns[turn]
			if (block) await runCutsceneEvents(block, iface)
		},
		finish: async (outcome) => {
			if (finished) return
			finished = true
			await runCutsceneEvents(localPlayerWon(outcome) ? script.win : script.lose, iface)
		},
		hasFinished: () => finished,
	}
}
