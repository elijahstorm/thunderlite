/**
 * campaignSave — mid-match resume for campaign levels.
 *
 * A campaign level's board is mutated two ways: player/CPU actions (which flow
 * through the deterministic `applyAction` log) AND cutscene-script beats (spawns,
 * terrain swaps, funds, damage) that bypass that log entirely. Replaying the
 * action log alone would therefore drop every scripted mutation, so instead we
 * snapshot the *resulting* state after each mutation and restore it wholesale on
 * an accidental refresh — no replay, no re-running the opening cutscene.
 *
 * The snapshot is a full picture: the board layers, the engine `gameState`
 * (funds, turn, whose turn, acted tiles, fog/stealth memory), the smoke-screen
 * store, and the cutscene runner's "which blocks already fired" flags. A cheap
 * signature over the *pristine* level pins the save to the map it was taken on,
 * so a redesigned level discards its now-meaningless save instead of restoring
 * units onto tiles that moved.
 *
 * Peer to `progress.ts` (unlock tracking): both are best-effort localStorage and
 * degrade to no-ops under SSR / privacy mode.
 */

import { writable } from 'svelte/store'
import { gameState, type GameState } from '$lib/Engine/gameState'
import { smokeTiles } from '$lib/Engine/smokeState'
import { fogOfWarEnabled } from '$lib/Engine/fogState'
import { speakerColorOverrides } from './speakerColors'
import { get } from 'svelte/store'
import type { CampaignRunnerState } from './campaignRunner'

/**
 * The active campaign level, or null outside campaign play. `CampaignMatch` sets
 * this on mount so the engine layer (`Game.svelte`) knows a match is a campaign
 * one — and which level to key its save under — without threading the id down
 * through the render tree. Editor maps with embedded scripts never set it, so
 * they get scripting but no resume, exactly as before this feature.
 */
export const currentCampaignLevelId = writable<string | null>(null)

/** Bump when the on-disk shape changes so old saves are ignored, not misread. */
const SCHEMA_VERSION = 1
const STORAGE_PREFIX = 'thunderlite.campaign.save.v1'

/** gameState with its non-JSON `Set` flattened to an array for storage. */
type SerializedGameState = Omit<GameState, 'actedTiles'> & { actedTiles: number[] }

export type CampaignSnapshot = {
	version: number
	signature: string
	savedAt: number
	turnNumber: number
	currentTeam: number
	layers: MapLayers
	gameState: SerializedGameState
	smoke: [number, number][]
	runner: CampaignRunnerState | null
	// Script-driven state that lives in module stores / on the map rather than in
	// `layers` or `gameState`. The opening cutscene (skipped on resume) is often
	// what set these, so they must ride in the save or a resumed level reverts to
	// the level's defaults (fog off, built-in voice colours, no tutorial pointers).
	fogEnabled: boolean
	speakerColors: Record<string, string>
	pointers: number[]
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const defaultStorage = (): StorageLike | null => {
	try {
		if (typeof window === 'undefined') return null
		return window.localStorage
	} catch {
		return null
	}
}

const storageKey = (levelId: string): string => `${STORAGE_PREFIX}:${levelId}`

/** djb2 — a small, dependency-free string hash rendered base36. */
const hash = (input: string): string => {
	let h = 5381
	for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0
	return (h >>> 0).toString(36)
}

/**
 * A fingerprint of the *pristine* level board (call before any mutation). Two
 * saves match only if their level id and starting layout agree, so editing a
 * level's map invalidates any in-progress save for it rather than restoring the
 * old board onto the new terrain.
 */
export const computeSignature = (map: MapObject, levelId: string): string => {
	const ground = map.layers.ground.map((g) => (g ? g.type : -1)).join(',')
	const units = map.layers.units
		.map((u, i) => (u ? `${i}:${u.type}:${u.team}` : ''))
		.filter(Boolean)
		.join(',')
	const buildings = map.layers.buildings
		.map((b, i) => (b ? `${i}:${b.type}:${b.team}` : ''))
		.filter(Boolean)
		.join(',')
	return hash(`${levelId}|${map.cols}x${map.rows}|G:${ground}|U:${units}|B:${buildings}`)
}

const serializeGameState = (state: GameState): SerializedGameState => ({
	...state,
	actedTiles: [...state.actedTiles],
})

const deserializeGameState = (state: SerializedGameState): GameState => ({
	...state,
	actedTiles: new Set(state.actedTiles),
})

/**
 * Take a full snapshot of the live match. `map.layers` is deep-copied so later
 * in-place engine mutation can't retro-edit the stored board; the caller passes
 * the cutscene runner's fired-state (null for unscripted levels).
 */
export const captureSnapshot = (
	map: MapObject,
	signature: string,
	runner: CampaignRunnerState | null
): CampaignSnapshot => {
	const state = get(gameState)
	return {
		version: SCHEMA_VERSION,
		signature,
		savedAt: Date.now(),
		turnNumber: state.turnNumber,
		currentTeam: state.currentTeam,
		layers: structuredClone(map.layers),
		gameState: serializeGameState(state),
		smoke: [...get(smokeTiles).entries()],
		runner,
		fogEnabled: get(fogOfWarEnabled),
		speakerColors: { ...get(speakerColorOverrides) },
		pointers: map.pointers ? [...map.pointers] : [],
	}
}

/** Pad a sparse per-tile layer to full board length so reads never fall off. */
const padLayer = <T>(layer: (T | null)[] | undefined, tiles: number): (T | null)[] => {
	const next = new Array<T | null>(tiles).fill(null)
	if (layer) for (let i = 0; i < layer.length && i < tiles; i++) next[i] = layer[i] ?? null
	return next
}

/**
 * Restore a snapshot onto the live match: swap in the saved board (reassigning
 * `map.layers`, mirroring the rematch path), reset transient overlay state, and
 * push the saved engine + smoke state back into their stores.
 */
export const applySnapshot = (map: MapObject, snap: CampaignSnapshot): void => {
	const tiles = map.cols * map.rows
	map.layers = {
		ground: snap.layers.ground,
		sky: snap.layers.sky ?? [],
		units: padLayer(snap.layers.units, tiles),
		buildings: padLayer(snap.layers.buildings, tiles),
	}
	map.route = []
	map.highlights = new Array(tiles)
	map.pathHistory = []
	map.pointers = new Set(snap.pointers ?? [])
	gameState.set(deserializeGameState(snap.gameState))
	smokeTiles.set(new Map(snap.smoke))
	// Restore script-driven state the opening cutscene would otherwise have set.
	// MapRender only pushes its `fogOfWar` prop into this store when the prop
	// changes, so setting it here (after mount) sticks for the resumed match.
	fogOfWarEnabled.set(snap.fogEnabled ?? false)
	speakerColorOverrides.set({ ...(snap.speakerColors ?? {}) })
}

/**
 * Read a resumable save for `levelId`. Returns null when there is none, when it
 * is a different schema/level layout (stale after a redesign), or when the saved
 * match is already over — a finished level has nothing to resume.
 */
export const loadSnapshot = (
	levelId: string,
	signature: string,
	storage: StorageLike | null = defaultStorage()
): CampaignSnapshot | null => {
	if (!storage) return null
	try {
		const raw = storage.getItem(storageKey(levelId))
		if (!raw) return null
		const snap = JSON.parse(raw) as CampaignSnapshot
		if (snap.version !== SCHEMA_VERSION) return null
		if (snap.signature !== signature) return null
		if (snap.gameState?.phase !== 'playing') return null
		return snap
	} catch {
		return null
	}
}

export const saveSnapshot = (
	levelId: string,
	snap: CampaignSnapshot,
	storage: StorageLike | null = defaultStorage()
): void => {
	if (!storage) return
	try {
		storage.setItem(storageKey(levelId), JSON.stringify(snap))
	} catch {
		/* quota / privacy mode — non-fatal */
	}
}

export const clearSnapshot = (
	levelId: string,
	storage: StorageLike | null = defaultStorage()
): void => {
	if (!storage) return
	try {
		storage.removeItem(storageKey(levelId))
	} catch {
		/* privacy mode — non-fatal */
	}
}
