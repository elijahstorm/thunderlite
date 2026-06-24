import { get } from 'svelte/store'
import { gameState } from '../gameState'
import { fogOfWarEnabled } from '../fogState'
import { computeTeamVisibility, concealedEnemyTiles, isStealthUnit } from '../visibility'

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

// An enemy stealth unit rolled off the line on `tile` for `builderTeam`. Every team
// that can see the spawn tile clocks one more cloakable threat for that team.
export const recordStealthBuild = (
	map: MapObject | MapProcesser,
	tile: number,
	builderTeam: number
): void => {
	for (const observer of teamsSeeing(map, tile)) adjust(observer, builderTeam, +1)
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

// Turn-start reconciliation for `observerTeam`: you can't believe an enemy has fewer
// stealth units than you can plainly see right now, so raise each remembered count
// up to the number of that team's stealth units currently revealed to us. Never
// lowers — a cloaked unit slipping out of sight isn't evidence it's gone.
export const observeStealthSightings = (
	map: MapObject,
	observerTeam: number
): void => {
	const concealed = concealedEnemyTiles(map, observerTeam)
	const seen = new Map<number, number>()
	const units = map.layers.units
	for (let tile = 0; tile < units.length; tile++) {
		const unit = units[tile]
		if (!unit || unit.team === observerTeam) continue
		if (!isStealthUnit(unit) || concealed.has(tile)) continue
		seen.set(unit.team, (seen.get(unit.team) ?? 0) + 1)
	}
	for (const [target, count] of seen) setFloor(observerTeam, target, count)
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
