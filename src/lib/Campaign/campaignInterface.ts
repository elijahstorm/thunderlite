/**
 * campaignInterface — the engine-backed implementation of `CampaignInterface`.
 *
 * This is the one place that knows how a scripted event becomes a real change
 * on the board: highlights write to `map.highlights` (the same array the
 * renderer paints), spawn/kill/setTerrain go through the engine's layer
 * mutation + `applyWinConditions` path (so a scripted kill can end the match and
 * drive the win/lose block), `talk` pushes to the dialogue overlay, and
 * `camera` publishes a pan request the renderer subscribes to.
 *
 * The runner (campaignRunner.ts) stays pure; this module is its single impure
 * dependency, injected at mount time.
 */

import { get, writable } from 'svelte/store'
import { terrainData } from '$lib/GameData/terrain'
import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { skyData } from '$lib/GameData/sky'
import { gameState, refreshControlsFromMap } from '$lib/Engine/gameState'
import { repaintSignal } from '$lib/Engine/Animator/animator'
import { beginMaterialize } from '$lib/Engine/materialize'
import { beginScriptedMutation, endScriptedMutation } from './scriptGate'
import { fogOfWarEnabled } from '$lib/Engine/fogState'
import { runModifiers } from '$lib/Engine/modifiers'
import { applyWinConditions } from '$lib/Engine/winConditions'
import { showDialogue, resetDialogueSkip } from './dialogueStore'
import { setSpeakerColorOverride, resetSpeakerColors } from './speakerColors'
import type { CampaignInterface } from './campaignRunner'

/**
 * The most recent camera pan a script requested, in tile coords (or `null`).
 * The renderer (K4 mode shell) subscribes and scrolls the Scroller; decoupling
 * the pan through a store keeps this module free of Scroller/DOM imports.
 */
export const campaignCamera = writable<{ x: number; y: number } | null>(null)

const unitTypeByName = (name: string): number => unitData.findIndex((u) => u.name === name)
const terrainTypeByName = (name: string): number => terrainData.findIndex((t) => t.name === name)
const buildingTypeByName = (name: string): number => buildingData.findIndex((b) => b.name === name)
const skyTypeByName = (name: string): number => skyData.findIndex((s) => s.name === name)

const tileFor = (map: MapObject, x: number, y: number): number => y * map.cols + x

export interface CampaignInterfaceConfig {
	map: MapObject
	/** The team controlled on this machine; `defeat` ends the match against it. */
	localTeam?: number
	/** Show dialogue; resolves when the player advances past the last line. */
	talk?: (speaker: string, lines: string[]) => Promise<void>
	/** Pan the camera to a tile. Defaults to publishing on `campaignCamera`. */
	camera?: (x: number, y: number) => void | Promise<void>
	/** Timed pause. Injectable for tests; defaults to `setTimeout`. */
	wait?: (seconds: number) => Promise<void>
}

const realWait = (seconds: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, Math.max(0, seconds) * 1000))

/** Build a live, engine-backed interface for the campaign runner. */
export const createCampaignInterface = (config: CampaignInterfaceConfig): CampaignInterface => {
	const { map, localTeam = 0 } = config
	const talk = config.talk ?? showDialogue
	const camera = config.camera ?? ((x: number, y: number) => campaignCamera.set({ x, y }))
	const wait = config.wait ?? realWait

	const ensurePointers = (): Set<number> => {
		if (!map.pointers) map.pointers = new Set<number>()
		return map.pointers
	}

	// A fresh level starts with no script colour overrides; the cast falls back to
	// the built-in voice colours until this level's `color` commands run.
	resetSpeakerColors()

	// A general hook for coalescing pending ground repaints and flushing them before
	// the player next looks at the board (block end, camera pan, dialogue, wait).
	// `setTerrain` no longer feeds it — it defers and self-repaints through the
	// materialize reveal — so it currently has no producers, but the flush points
	// stay wired for any future batched ground mutation that needs them.
	let groundDirty = false
	const flushGround = () => {
		if (!groundDirty) return
		groundDirty = false
		repaintSignal.update((n) => n + 1)
	}

	return {
		// Each block starts fresh: a Skip in the previous block must not silence this one.
		beginBlock: () => resetDialogueSkip(),

		camera: (x, y) => {
			flushGround()
			return camera(x, y)
		},

		highlight: (x, y) => {
			ensurePointers().add(tileFor(map, x, y))
		},

		unhighlight: (x, y) => {
			map.pointers?.delete(tileFor(map, x, y))
		},

		talk: (speaker, lines) => {
			// Repaint pending terrain before the dialogue blocks, so the player reads
			// it over the updated board rather than a stale one.
			flushGround()
			return talk(speaker, lines)
		},

		setSpeakerColor: (speaker, color) => {
			setSpeakerColorOverride(speaker, color)
		},

		spawn: (team, unit, x, y) => {
			const type = unitTypeByName(unit)
			if (type < 0) return
			const tile = tileFor(map, x, y)
			map.layers.units[tile] = {
				type,
				state: 0,
				team,
				health: unitData[type].health,
			}
			// Pixel warp-in so the unit assembles onto the board instead of popping
			// into being between frames. The unit is placed now (so sight and win
			// conditions are correct) but stays hidden under the assemble; hold the
			// script gate over the whole animation so neither the player nor the CPU
			// can act on the half-arrived unit until it has fully appeared.
			beginScriptedMutation()
			beginMaterialize(tile, 'spawn', { onDone: endScriptedMutation })
			applyWinConditions(map)
		},

		kill: (x, y) => {
			const tile = tileFor(map, x, y)
			const unit = map.layers.units[tile]
			if (!unit) return
			// Mirror the engine's death path (applyAction.reduceHealth): clear the
			// tile, run Death modifiers, then re-check win conditions.
			map.layers.units[tile] = null
			runModifiers(unit, 'Death', { kind: 'unit', tile, state: get(gameState), map })
			applyWinConditions(map)
		},

		hurt: (x, y, health) => {
			const unit = map.layers.units[tileFor(map, x, y)]
			if (!unit) return
			// Injure only — clamp into [1, max] so a script can batter a unit into
			// fodder without destroying it (use `kill` for that).
			const max = unitData[unit.type]?.health ?? health
			unit.health = Math.max(1, Math.min(max, Math.round(health)))
		},

		setTerrain: (terrain, x, y) => {
			const type = terrainTypeByName(terrain)
			if (type < 0) return
			const tile = tileFor(map, x, y)
			// Top-down pixel sweep so the reshaped tile builds in rather than blinking
			// over. The actual swap is deferred until the sweep has fully covered the
			// tile (onReveal), so the old terrain shows until the cover clears onto the
			// new one — no half-changed tile, and neighbours never connect to terrain
			// that isn't visible yet. The reveal bumps the repaint so connections
			// recompute against the new shape. The script gate is held over the whole
			// assemble so nobody paths across the tile while its terrain is mid-swap.
			beginScriptedMutation()
			beginMaterialize(tile, 'terrain', {
				onReveal: () => {
					map.layers.ground[tile] = { type, state: 0 }
					repaintSignal.update((n) => n + 1)
				},
				onDone: endScriptedMutation,
			})
		},

		setWeather: (weather, x, y) => {
			const type = skyTypeByName(weather)
			if (type < 0) return
			map.layers.sky[tileFor(map, x, y)] = { type, state: 0 }
		},

		clearWeather: (x, y) => {
			map.layers.sky[tileFor(map, x, y)] = null
		},

		fog: (on) => {
			fogOfWarEnabled.set(on)
		},

		funds: (team, amount) => {
			gameState.update((s) => ({
				...s,
				players: s.players.map((p) =>
					p.team === team ? { ...p, money: Math.max(0, p.money + amount) } : p
				),
			}))
		},

		addBuilding: (team, building, x, y) => {
			const type = buildingTypeByName(building)
			if (type < 0) return
			map.layers.buildings[tileFor(map, x, y)] = { type, team, state: 0 }
			refreshControlsFromMap(map)
			applyWinConditions(map)
		},

		removeBuilding: (x, y) => {
			map.layers.buildings[tileFor(map, x, y)] = null
			refreshControlsFromMap(map)
			applyWinConditions(map)
		},

		ownBuilding: (team, x, y) => {
			const tile = tileFor(map, x, y)
			const building = map.layers.buildings[tile]
			if (!building) return
			building.team = team
			refreshControlsFromMap(map)
			applyWinConditions(map)
		},

		defeat: () => {
			// End the match against the local player: flip to gameOver with a non-local
			// winner. GameStateManager observes the transition and emits the match
			// result, which drives the `lose` block.
			const state = get(gameState)
			const enemy = state.players.find((p) => p.team !== localTeam)?.team ?? (localTeam === 0 ? 1 : 0)
			gameState.update((s) => ({ ...s, phase: 'gameOver', winner: enemy }))
		},

		wait: (seconds) => {
			// A timed pause is the player watching the board — show pending terrain first.
			flushGround()
			return wait(seconds)
		},

		flush: () => flushGround(),
	}
}
