/**
 * boardDigest — a compact, deterministic fingerprint of the whole game board.
 *
 * Online play has no server-side simulation: every client runs the same engine
 * over the same ordered event log and is trusted to land on the same state. When
 * one client silently drops or reorders an action (see `desync.ts`) the two
 * boards diverge and *nothing notices* — the difference just compounds, move
 * after move, until the two players are effectively playing different games.
 *
 * A digest is how that becomes detectable. Each client hashes its board at a
 * known point in the log (`GameEvent.id`) and ships it to `game_log`; two
 * clients that report different digests for the SAME event id have provably
 * diverged, and the last event id they agreed on is the divergence point.
 *
 * Determinism rules for anything added here:
 *   - iterate tiles in index order, never a Map/Set/object key order;
 *   - include only authoritative state (health, team, position, money, turn),
 *     never per-viewer state (fog, selection, camera) or animation scratch
 *     fields (`displayHealth`, `animating`) — those legitimately differ between
 *     the two clients and would produce false positives.
 */

import { get } from 'svelte/store'
import { gameState } from './gameState'
import { unitData } from '$lib/GameData/unit'

/** Per-tile unit facts that both clients must agree on, in tile order. */
const unitsPart = (map: MapObject | MapProcesser): string => {
	const parts: string[] = []
	for (let tile = 0; tile < map.layers.units.length; tile++) {
		const unit = map.layers.units[tile]
		if (!unit) continue
		const max = unitData[unit.type]?.health ?? 0
		// `health` is undefined until a unit is first damaged; normalize to its max
		// so a pristine unit hashes identically on both sides.
		const health = unit.health ?? max
		parts.push(
			[
				tile,
				unit.type,
				unit.team,
				health,
				unit.hidden ? 1 : 0,
				unit.attacked ? 1 : 0,
				// A Warmachine's private build wallet is real board state (it desyncs
				// on a dropped build-adjacent); `undefined` means "still the type's
				// starting value", so normalize it out rather than hashing the hole.
				unit.wallet ?? -1,
				// A loaded transport carries its passenger's identity, which is board
				// state and can itself desync (a load applied on one side only).
				unit.rescuedUnit ? `${unit.rescuedUnit.type}:${unit.rescuedUnit.team}` : '-',
			].join(':')
		)
	}
	return parts.join(',')
}

/** Per-tile building ownership + capture progress (`stature`), in tile order. */
const buildingsPart = (map: MapObject | MapProcesser): string => {
	const parts: string[] = []
	for (let tile = 0; tile < map.layers.buildings.length; tile++) {
		const building = map.layers.buildings[tile]
		if (!building) continue
		// `stature` is capture progress and `resources` the income reservoir; both
		// default lazily, so an untouched building hashes as -1 on both clients.
		parts.push(
			[tile, building.type, building.team, building.stature ?? -1, building.resources ?? -1].join(
				':'
			)
		)
	}
	return parts.join(',')
}

/** Turn pointer, turn number, and each side's money / alive flag. */
const statePart = (): string => {
	const state = get(gameState)
	const players = [...state.players]
		.sort((a, b) => a.team - b.team)
		.map((p) => `${p.team}:${p.money}:${p.hasLost ? 1 : 0}`)
		.join(',')
	return `t${state.turnNumber}/c${state.currentTeam}/p${state.phase}/[${players}]`
}

/** The full canonical string a digest is computed from. Exported for diffing. */
export const boardSnapshot = (map: MapObject | MapProcesser): string =>
	`${statePart()}|U[${unitsPart(map)}]|B[${buildingsPart(map)}]`

/**
 * FNV-1a over the snapshot, rendered as 8 hex chars. Not cryptographic — it only
 * has to make an accidental collision between two *different* boards unlikely,
 * and 32 bits is plenty for the handful of checkpoints one match produces.
 */
export const hashString = (input: string): string => {
	let hash = 0x811c9dc5
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i)
		// FNV prime (16777619) via shifts — keeps the whole thing in int32 land.
		hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0
	}
	return hash.toString(16).padStart(8, '0')
}

/** The 8-hex-char fingerprint two clients compare. */
export const boardDigest = (map: MapObject | MapProcesser): string => hashString(boardSnapshot(map))

/** Digest plus the cheap counters that make a mismatch readable at a glance. */
export const boardDigestDetail = (
	map: MapObject | MapProcesser
): { digest: string; units: number; buildings: number; turn: number; team: number } => {
	const state = get(gameState)
	let units = 0
	for (const unit of map.layers.units) if (unit) units++
	let buildings = 0
	for (const building of map.layers.buildings) if (building) buildings++
	return {
		digest: boardDigest(map),
		units,
		buildings,
		turn: state.turnNumber,
		team: state.currentTeam,
	}
}
