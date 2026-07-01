import { get } from 'svelte/store'
import { gameState } from '../gameState'
import { fogOfWarEnabled } from '../fogState'
import { adjacentTiles } from '../modifiers/cloak'
import { tilesInRange } from '../modifiers/radar'
import { unitData } from '$lib/GameData/unit'
import {
	computeTeamVisibility,
	concealedEnemyTiles,
	hasRadarField,
	isStealthUnit,
	radarTeamsCovering,
} from '../visibility'

// ── CPU "memory" of enemy stealth strength ────────────────────────────────────
// The AI keeps a fuzzy, per-enemy running estimate of how many cloakable units it
// believes each other team fields — stored as a JSON map on Player.stealthMemory
// (`{ [targetTeam]: count }`, clamped >= 0). It's deliberately imperfect: it only
// updates from what the CPU actually witnesses, so it drifts away from the real
// game state (it can remember 8 Stealth Tanks that have long since died, or miss a
// sub it never saw built). Three signals move it:
//
//   • build  — sees an enemy roll a stealth unit out of a factory  → +1
//   • death  — sees an enemy stealth unit destroyed                → −1
//   • sighting — currently perceives N of an enemy's stealth units → floor to N
//
// "Witnessing" is gated on fog: a team only logs an event on a tile its own units
// can see (fog off → everyone sees everything, so the memory tracks reality). The
// estimate then feeds the planner's caution (see score.ts `lurking`), so the CPU
// doesn't treat a board it remembers as stealth-heavy like the enemy is suddenly a
// lone weak unit. Single-player only in practice — humans don't consult it.

const livingTeams = (): number[] => get(gameState).players.map((p) => p.team)

// Teams whose units can currently see `tile`. With fog off, everyone sees it.
const teamsSeeing = (map: MapObject | MapProcesser, tile: number): number[] => {
	const teams = livingTeams()
	if (!get(fogOfWarEnabled)) return teams
	return teams.filter((team) => computeTeamVisibility(map, team).has(tile))
}

// Nudge `observer`'s remembered count of `target`'s stealth units by `delta`,
// clamped to >= 0. Stored back on the player record so it persists across turns.
const adjust = (observer: number, target: number, delta: number): void => {
	if (observer === target) return
	gameState.update((s) => ({
		...s,
		players: s.players.map((p) => {
			if (p.team !== observer) return p
			const mem = { ...(p.stealthMemory ?? {}) }
			mem[target] = Math.max(0, (mem[target] ?? 0) + delta)
			return { ...p, stealthMemory: mem }
		}),
	}))
}

const setFloor = (observer: number, target: number, floor: number): void => {
	if (observer === target || floor <= 0) return
	gameState.update((s) => ({
		...s,
		players: s.players.map((p) => {
			if (p.team !== observer) return p
			const mem = { ...(p.stealthMemory ?? {}) }
			if ((mem[target] ?? 0) >= floor) return p
			mem[target] = floor
			return { ...p, stealthMemory: mem }
		}),
	}))
}

// ── Fuzzy "where is it" hunch ──────────────────────────────────────────────────
// A per-observer heat map (Player.stealthSuspicion, keyed by tile) of where a
// cloaked enemy probably is. A fresh sighting plants SEED heat; each of the
// observer's turns the cloud decays and bleeds a slice into its neighbours, so a
// stale pin widens into a vague blob (a stealth unit moves several tiles a turn).
const SUSPICION_SEED = 1
// Diffusion is mass-CONSERVING-then-decayed: each turn a tile keeps SUSPICION_KEEP of
// its heat and hands SUSPICION_BLEED of *that* out to its neighbours (split between
// them). Total heat therefore strictly shrinks by SUSPICION_KEEP per turn and no tile
// can ever climb above the seed value — the cloud widens and fades, it never blows up.
// KEEP is high so a fresh sighting survives long enough for the CPU to build a radar
// AND drive it over — at ~0.9 a pin stays above the floor for ~9-10 of its turns.
const SUSPICION_KEEP = 0.9 // total heat retained per turn (the decay)
const SUSPICION_BLEED = 0.28 // share of retained heat that spreads to neighbours
const SUSPICION_FLOOR = 0.04 // below this a tile is forgotten

// Plant/refresh heat at concrete tiles in `observer`'s hunch. Takes the max with any
// existing heat so a fresh sighting never dims a hotter one already there.
const seedSuspicion = (observer: number, tiles: Iterable<number>): void => {
	gameState.update((s) => ({
		...s,
		players: s.players.map((p) => {
			if (p.team !== observer) return p
			const heat = { ...(p.stealthSuspicion ?? {}) }
			let touched = false
			for (const tile of tiles) {
				if ((heat[tile] ?? 0) < SUSPICION_SEED) {
					heat[tile] = SUSPICION_SEED
					touched = true
				}
			}
			return touched ? { ...p, stealthSuspicion: heat } : p
		}),
	}))
}

// Age `observerTeam`'s hunch by one of its turns: decay every tile and diffuse a
// slice outward, then drop whatever fell below the floor. Called at the CPU's turn
// start. With nothing remembered this is a no-op.
export const decayStealthSuspicion = (map: MapObject | MapProcesser, observerTeam: number): void => {
	gameState.update((s) => ({
		...s,
		players: s.players.map((p) => {
			if (p.team !== observerTeam) return p
			const old = p.stealthSuspicion
			if (!old || Object.keys(old).length === 0) return p
			const next: Record<number, number> = {}
			const add = (tile: number, amount: number) => {
				next[tile] = (next[tile] ?? 0) + amount
			}
			for (const [key, value] of Object.entries(old)) {
				const tile = Number(key)
				const retained = value * SUSPICION_KEEP
				const nbs = adjacentTiles(map, tile)
				const toSpread = nbs.length > 0 ? retained * SUSPICION_BLEED : 0
				add(tile, retained - toSpread)
				const share = nbs.length > 0 ? toSpread / nbs.length : 0
				for (const nb of nbs) add(nb, share)
			}
			const cleaned: Record<number, number> = {}
			for (const [key, value] of Object.entries(next)) {
				if (value >= SUSPICION_FLOOR) cleaned[Number(key)] = value
			}
			return { ...p, stealthSuspicion: cleaned }
		}),
	}))
}

// The hottest tile in `observerTeam`'s hunch — the planner's single best guess at
// where to point a probe or a radar sweep. Null when the hunch is empty.
export const strongestSuspicion = (observerTeam: number): { tile: number; heat: number } | null => {
	const heat = get(gameState).players.find((p) => p.team === observerTeam)?.stealthSuspicion
	if (!heat) return null
	let best: { tile: number; heat: number } | null = null
	for (const [key, value] of Object.entries(heat)) {
		if (!best || value > best.heat) best = { tile: Number(key), heat: value }
	}
	return best
}

// Rule out the parts of the hunch the observer has actually checked and found empty.
// A cloaked unit is only flushed by a sensor that beats stealth — an adjacent unit
// (point-blank) or a Jammer Truck's radar ring — so those are the tiles we can call
// "searched". Any searched tile that holds no enemy is cleared from the hunch, so the
// CPU's best guess MOVES on instead of camping a spot it has already swept. Called at
// the CPU's turn start, after sightings are reconciled.
export const clearSearchedSuspicion = (map: MapObject | MapProcesser, observerTeam: number): void => {
	const heat = get(gameState).players.find((p) => p.team === observerTeam)?.stealthSuspicion
	if (!heat || Object.keys(heat).length === 0) return

	const searched = new Set<number>()
	const units = map.layers.units
	for (let tile = 0; tile < units.length; tile++) {
		const u = units[tile]
		if (!u || u.team !== observerTeam) continue
		// Point-blank: a unit flushes cloak on its own tile and the four around it.
		searched.add(tile)
		for (const adj of adjacentTiles(map, tile)) searched.add(adj)
		// Radar: the whole ring is swept.
		if (hasRadarField(u)) {
			const [min, max] = unitData[u.type]?.range ?? [0, 0]
			for (const ring of tilesInRange(map, tile, min, max)) searched.add(ring)
		}
	}

	const enemyOn = (tile: number): boolean => {
		const u = units[tile]
		return !!u && u.team !== observerTeam
	}

	gameState.update((s) => ({
		...s,
		players: s.players.map((p) => {
			if (p.team !== observerTeam) return p
			const current = p.stealthSuspicion
			if (!current) return p
			const cleaned: Record<number, number> = {}
			let changed = false
			for (const [key, value] of Object.entries(current)) {
				const tile = Number(key)
				// Searched and empty → ruled out; otherwise keep. (If an enemy is actually
				// there the sensor has already revealed it, so the hunch is moot anyway.)
				if (searched.has(tile) && !enemyOn(tile)) {
					changed = true
					continue
				}
				cleaned[tile] = value
			}
			return changed ? { ...p, stealthSuspicion: cleaned } : p
		}),
	}))
}

// An enemy stealth unit rolled off the line on `tile` for `builderTeam`. Every team
// that can see the spawn tile clocks one more cloakable threat for that team — and
// pins the factory as a starting hunch for where that unit went.
export const recordStealthBuild = (
	map: MapObject | MapProcesser,
	tile: number,
	builderTeam: number
): void => {
	for (const observer of teamsSeeing(map, tile)) {
		adjust(observer, builderTeam, +1)
		seedSuspicion(observer, [tile])
	}
}

// A direct, un-gated "observer now knows a cloaked `target` unit is around `tiles`"
// signal: bumps the remembered tally by one and plants the location hunch. Unlike
// the witnessing helpers above it does not check fog or radar — it's for callers that
// have already decided the sighting happened (intel scripting, the dev playground).
export const noteStealthSighting = (
	observer: number,
	target: number,
	tiles: Iterable<number>
): void => {
	adjust(observer, target, +1)
	seedSuspicion(observer, tiles)
}

// A stealth unit belonging to `deadTeam` was destroyed on `tile`. Every team that
// witnessed it crosses one off its remembered tally for that team.
export const recordStealthDeath = (
	map: MapObject | MapProcesser,
	tile: number,
	deadTeam: number
): void => {
	for (const observer of teamsSeeing(map, tile)) adjust(observer, deadTeam, -1)
}

// A cloaked unit briefly broke cover by walking through a jammer's radar ring on its
// way past — even if it slipped back into the dark before stopping. Radar is its own
// sensor (no fog gate), so every team whose ring the route `route` crossed now knows
// the mover's team fields at least one cloakable unit. `setFloor` never lowers, so a
// fleeting sighting can't erase a richer estimate built from witnessed builds.
export const recordStealthPassthrough = (
	map: MapObject | MapProcesser,
	route: number[],
	mover: UnitObject
): void => {
	if (!isStealthUnit(mover) || route.length === 0) return
	// Per observer, collect the exact route tiles that fell inside *its* ring — those
	// are concrete, fresh locations to seed the hunch with, not just a +1 to the tally.
	const seen = new Map<number, number[]>()
	for (const tile of route) {
		for (const team of radarTeamsCovering(map, tile, mover.team)) {
			const tiles = seen.get(team) ?? []
			tiles.push(tile)
			seen.set(team, tiles)
		}
	}
	for (const [observer, tiles] of seen) {
		setFloor(observer, mover.team, 1)
		seedSuspicion(observer, tiles)
	}
}

// Turn-start reconciliation for `observerTeam`: you can't believe an enemy has fewer
// stealth units than you can plainly see right now, so raise each remembered count
// up to the number of that team's stealth units currently revealed to us. Never
// lowers — a cloaked unit slipping out of sight isn't evidence it's gone.
export const observeStealthSightings = (
	map: MapObject | MapProcesser,
	observerTeam: number
): void => {
	const concealed = concealedEnemyTiles(map, observerTeam)
	const seen = new Map<number, number>()
	const sightedTiles: number[] = []
	const units = map.layers.units
	for (let tile = 0; tile < units.length; tile++) {
		const unit = units[tile]
		if (!unit || unit.team === observerTeam) continue
		if (!isStealthUnit(unit) || concealed.has(tile)) continue
		seen.set(unit.team, (seen.get(unit.team) ?? 0) + 1)
		sightedTiles.push(tile)
	}
	for (const [target, count] of seen) setFloor(observerTeam, target, count)
	// Pin where we see them now, so once they re-cloak the decaying hunch still points
	// the hunt at their last known spot.
	if (sightedTiles.length > 0) seedSuspicion(observerTeam, sightedTiles)
}

// Re-run the turn-start reconciliation for *every* team, right now. Called after each
// committed move so the instant a cloaked unit is flushed into the open — an enemy
// drives up point-blank, a collision halts a unit beside it, a radar sweep catches it
// — the watcher records its exact tile, instead of only sampling at its own turn start
// (by when the unit has long since slipped away). No-op on boards with no stealth.
export const recordPerceivedStealth = (map: MapObject | MapProcesser): void => {
	for (const team of livingTeams()) observeStealthSightings(map, team)
}

// A cloaked unit gave itself away by acting in the open (an attack is loud and seen by
// everyone). Every rival team now knows that team fields a cloak unit and exactly where
// it struck from — even though it may re-cloak the very next instant. Unlike the
// fog-gated witnessing helpers this is unconditional: being attacked is unambiguous.
export const noteStealthRevealed = (
	map: MapObject | MapProcesser,
	tile: number,
	unit: UnitObject
): void => {
	if (!isStealthUnit(unit)) return
	for (const observer of livingTeams()) {
		if (observer === unit.team) continue
		setFloor(observer, unit.team, 1)
		seedSuspicion(observer, [tile])
	}
}

// Enemy stealth `observerTeam` remembers but cannot currently see — the lurking
// threat that should make it play more carefully. Subtracts what's presently
// revealed so a unit already in plain sight isn't double-counted as a phantom.
export const lurkingStealthCount = (map: MapObject, observerTeam: number): number => {
	const mem = get(gameState).players.find((p) => p.team === observerTeam)?.stealthMemory
	if (!mem) return 0
	const concealed = concealedEnemyTiles(map, observerTeam)
	const seen = new Map<number, number>()
	const units = map.layers.units
	for (let tile = 0; tile < units.length; tile++) {
		const unit = units[tile]
		if (!unit || unit.team === observerTeam) continue
		if (!isStealthUnit(unit) || concealed.has(tile)) continue
		seen.set(unit.team, (seen.get(unit.team) ?? 0) + 1)
	}
	let lurking = 0
	for (const [teamStr, count] of Object.entries(mem)) {
		lurking += Math.max(0, count - (seen.get(Number(teamStr)) ?? 0))
	}
	return lurking
}
