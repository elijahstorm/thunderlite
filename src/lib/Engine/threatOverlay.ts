import { writable, get } from 'svelte/store'
import { unitThreatTiles } from './Interactor/Pathing/threat'
import { viewerVisibility } from './fogState'
import { isUnitStealthed, unitSeenByViewer } from './visibility'

// The local player's team — the vantage point the threat overlay is drawn from.
// "Enemy" always means "not on this team", regardless of whose turn it currently
// is, so the planning aid behaves the same during an opponent's/CPU's turn.
// `GameBoard` keeps this in sync with its `localTeam` prop.
export const viewerTeam = writable<number>(0)

// The set of ENEMY units whose attack reach is painted on the board as a
// persistent planning overlay. Keyed by the unit OBJECT, not its tile index:
// `applyMove` carries the same object reference to the unit's new tile, so the
// toggle follows the unit as it moves (rather than sticking to the vacated tile
// and silently transferring to whatever steps onto it). When a unit dies it's
// dropped from `map.layers.units` entirely, so the overlay self-heals without an
// explicit clear. The master toggle flips this between "every visible enemy" and
// "none"; clicking a single enemy adds or removes just that unit.
export const shownThreatUnits = writable<Set<UnitObject>>(new Set())

// Enemy units the local viewer can actually see — never leak threat from a unit
// hidden in fog. With fog off, `viewerVisibility` is null and every off-team unit
// counts.
export const visibleEnemyUnits = (map: MapObject): UnitObject[] => {
	const team = get(viewerTeam)
	const fog = get(viewerVisibility)
	const units = map.layers.units
	const out: UnitObject[] = []
	for (let i = 0; i < units.length; i++) {
		const u = units[i]
		if (!u || u.team === team) continue
		// Per-unit fog check: an air enemy above canopy/ridge fog is still seen.
		if (!unitSeenByViewer(fog, i, u)) continue
		// A stealthed/cloaked enemy must never appear in the overlay — showing its reach
		// would betray that it exists and where it can strike. (Holds with fog off too.)
		if (isUnitStealthed(map, i, u)) continue
		out.push(u)
	}
	return out
}

export const isThreatUnitShown = (unit: UnitObject): boolean => get(shownThreatUnits).has(unit)

// Add or remove a single enemy's reach from the overlay.
export const toggleThreatUnit = (unit: UnitObject): void => {
	shownThreatUnits.update((set) => {
		const next = new Set(set)
		if (next.has(unit)) next.delete(unit)
		else next.add(unit)
		return next
	})
}

// Master switch: if every visible enemy is already shown, clear everything;
// otherwise reveal them all.
export const toggleAllThreats = (map: MapObject): void => {
	const enemies = visibleEnemyUnits(map)
	shownThreatUnits.update((set) => {
		const allShown = enemies.length > 0 && enemies.every((u) => set.has(u))
		return allShown ? new Set<UnitObject>() : new Set(enemies)
	})
}

export const clearThreatOverlay = (): void => shownThreatUnits.set(new Set())

// The shown units that are still on the board and still visible, paired with the
// tile each currently occupies. Stale entries (a unit that has died or slipped
// into fog/stealth) are simply skipped, so the overlay self-heals. Both the reach
// painter and the source-unit marker derive from this single filtered pass.
const liveShownUnits = (map: MapObject, shown: Set<UnitObject>): Array<{ unit: UnitObject; tile: number }> => {
	const out: Array<{ unit: UnitObject; tile: number }> = []
	if (shown.size === 0) return out
	const team = get(viewerTeam)
	const fog = get(viewerVisibility)
	const units = map.layers.units
	for (let tile = 0; tile < units.length; tile++) {
		const unit = units[tile]
		if (!unit || !shown.has(unit) || unit.team === team) continue
		if (!unitSeenByViewer(fog, tile, unit)) continue
		// Skip a unit that's slipped into stealth/cloak so a hidden enemy's reach is
		// never drawn — the overlay self-heals without an explicit clear.
		if (isUnitStealthed(map, tile, unit)) continue
		out.push({ unit, tile })
	}
	return out
}

// Union of attack reach for every shown enemy that's still on the board and still
// visible.
export const computeShownThreatTiles = (map: MapObject, shown: Set<UnitObject>): Set<number> => {
	const out = new Set<number>()
	for (const { unit, tile } of liveShownUnits(map, shown)) {
		for (const t of unitThreatTiles(map, tile, unit)) out.add(t)
	}
	return out
}

// The tiles currently occupied by the shown enemy units themselves — used to
// frame each source unit with a red outline/tint so the player can tell which
// unit owns the crimson reach painted around it.
export const computeShownThreatUnitTiles = (map: MapObject, shown: Set<UnitObject>): Set<number> => {
	const out = new Set<number>()
	for (const { tile } of liveShownUnits(map, shown)) out.add(tile)
	return out
}
