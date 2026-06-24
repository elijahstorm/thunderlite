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
import { fogOfWarEnabled } from '$lib/Engine/fogState'
import { runModifiers } from '$lib/Engine/modifiers'
import { applyWinConditions } from '$lib/Engine/winConditions'
import { showDialogue } from './dialogueStore'
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
	const { map } = config
	const talk = config.talk ?? showDialogue
	const camera = config.camera ?? ((x: number, y: number) => campaignCamera.set({ x, y }))
	const wait = config.wait ?? realWait

	const ensurePointers = (): Set<number> => {
		if (!map.pointers) map.pointers = new Set<number>()
		return map.pointers
	}

	return {
		camera: (x, y) => camera(x, y),

		highlight: (x, y) => {
			ensurePointers().add(tileFor(map, x, y))
		},

		unhighlight: (x, y) => {
			map.pointers?.delete(tileFor(map, x, y))
		},

		talk: (speaker, lines) => talk(speaker, lines),

		spawn: (team, unit, x, y) => {
			const type = unitTypeByName(unit)
			if (type < 0) return
			map.layers.units[tileFor(map, x, y)] = {
				type,
				state: 0,
				team,
				health: unitData[type].health,
			}
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

		setTerrain: (terrain, x, y) => {
			const type = terrainTypeByName(terrain)
			if (type < 0) return
			map.layers.ground[tileFor(map, x, y)] = { type, state: 0 }
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

		wait: (seconds) => wait(seconds),
	}
}
