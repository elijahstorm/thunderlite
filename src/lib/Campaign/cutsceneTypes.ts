/**
 * cutsceneTypes — engine-free, typed representation of a parsed level script.
 *
 * The original game (`Script_Reader` in the old `levels.js`) drove its tutorial
 * campaign from plain-text scripts with `<start>` / `<win>` / `<lose>` /
 * `<turn N>` blocks. This module ports the *shape* of that data into a typed
 * discriminated union, mirroring the style of
 * [`serializedAction.ts`](../Engine/Interactor/serializedAction.ts): every event
 * is a plain object keyed by `kind`, so the campaign runner (K2+) can dispatch
 * on it without the parser knowing anything about the live game.
 */

/** A single ordered cutscene instruction, as a discriminated union on `kind`. */
export type CutsceneEvent =
	/** Show one speaker saying one or more lines. Lines preserved verbatim. */
	| { kind: 'talk'; speaker: string; lines: string[] }
	/** Pan the camera to a tile. */
	| { kind: 'camera'; x: number; y: number }
	/** Highlight a tile. */
	| { kind: 'highlight'; x: number; y: number }
	/** Remove a tile highlight. */
	| { kind: 'unhighlight'; x: number; y: number }
	/** Pause the cutscene for `seconds`. */
	| { kind: 'wait'; seconds: number }
	/** Spawn a unit for `team` at a tile. `unit` matches a `unitData` name. */
	| { kind: 'spawn'; team: number; unit: string; x: number; y: number }
	/** Remove whatever unit occupies a tile. */
	| { kind: 'kill'; x: number; y: number }
	/** Replace the terrain at a tile. */
	| { kind: 'setTerrain'; terrain: string; x: number; y: number }
	/** Set the weather/sky at a tile. `weather` matches a `skyData` name. */
	| { kind: 'setWeather'; weather: string; x: number; y: number }
	/** Clear the weather/sky at a tile. */
	| { kind: 'clearWeather'; x: number; y: number }
	/** Turn fog of war on or off for the rest of the match. */
	| { kind: 'fog'; on: boolean }
	/** Add (or, when negative, subtract) funds for `team`. */
	| { kind: 'funds'; team: number; amount: number }
	/** Place a building for `team` at a tile. `building` matches a `buildingData` name. */
	| { kind: 'addBuilding'; team: number; building: string; x: number; y: number }
	/** Remove whatever building occupies a tile. */
	| { kind: 'removeBuilding'; x: number; y: number }
	/** Change the owning team of the building at a tile. */
	| { kind: 'ownBuilding'; team: number; x: number; y: number }

export type CutsceneEventKind = CutsceneEvent['kind']

/**
 * Events grouped by the block marker that contained them. `turns` is keyed by
 * `[round][team]` — both zero-based. `<turn 0,1>` routes into `turns[0][1]`
 * (round 0, team 1 — typically the CPU's first turn). `<turn N>` is shorthand
 * for `<turn N,0>` so the team defaults to the player.
 */
export interface CutsceneScript {
	start: CutsceneEvent[]
	win: CutsceneEvent[]
	lose: CutsceneEvent[]
	turns: Record<number, Record<number, CutsceneEvent[]>>
}

/**
 * Raised when a script cannot be parsed. Carries the 1-based source `line` so
 * authoring mistakes surface with a pointer instead of being silently dropped.
 */
export class CutsceneParseError extends Error {
	readonly line: number

	constructor(message: string, line: number) {
		super(`Cutscene parse error (line ${line}): ${message}`)
		this.name = 'CutsceneParseError'
		this.line = line
	}
}
