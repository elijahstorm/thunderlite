import { writable, get } from 'svelte/store'
import { unitThreatTiles } from './Interactor/Pathing/threat'
import { viewerVisibility } from './fogState'

// The local player's team — the vantage point the threat overlay is drawn from.
// "Enemy" always means "not on this team", regardless of whose turn it currently
// is, so the planning aid behaves the same during an opponent's/CPU's turn.
// `GameBoard` keeps this in sync with its `localTeam` prop.
export const viewerTeam = writable<number>(0)

// The set of ENEMY unit tiles whose attack reach is painted on the board as a
// persistent planning overlay. Keyed by tile index — enemies don't move during
// the local player's turn, so the index is a stable handle while planning. The
// master toggle flips this between "every visible enemy" and "none"; clicking a
// single enemy adds or removes just that unit.
export const shownThreatUnits = writable<Set<number>>(new Set())

// Enemy unit tiles the local viewer can actually see — never leak threat from a
// unit hidden in fog. With fog off, `viewerVisibility` is null and every off-team
// unit counts.
export const visibleEnemyTiles = (map: MapObject): number[] => {
	const team = get(viewerTeam)
	const fog = get(viewerVisibility)
	const units = map.layers.units
	const out: number[] = []
	for (let i = 0; i < units.length; i++) {
		const u = units[i]
		if (!u || u.team === team) continue
		if (fog && !fog.visible.has(i)) continue
		out.push(i)
	}
	return out
}

export const isThreatUnitShown = (tile: number): boolean => get(shownThreatUnits).has(tile)

// Add or remove a single enemy's reach from the overlay.
export const toggleThreatUnit = (tile: number): void => {
	shownThreatUnits.update((set) => {
		const next = new Set(set)
		if (next.has(tile)) next.delete(tile)
		else next.add(tile)
		return next
	})
}

// Master switch: if every visible enemy is already shown, clear everything;
// otherwise reveal them all.
export const toggleAllThreats = (map: MapObject): void => {
	const enemies = visibleEnemyTiles(map)
	shownThreatUnits.update((set) => {
		const allShown = enemies.length > 0 && enemies.every((t) => set.has(t))
		return allShown ? new Set<number>() : new Set(enemies)
	})
}

export const clearThreatOverlay = (): void => shownThreatUnits.set(new Set())

// Union of attack reach for every shown enemy that's still on the board and still
// visible. Stale entries (a unit that has died or slipped into fog) are simply
// skipped, so the overlay self-heals without needing to be explicitly cleared.
export const computeShownThreatTiles = (map: MapObject, shown: Set<number>): Set<number> => {
	const out = new Set<number>()
	if (shown.size === 0) return out
	const team = get(viewerTeam)
	const fog = get(viewerVisibility)
	for (const tile of shown) {
		const unit = map.layers.units[tile]
		if (!unit || unit.team === team) continue
		if (fog && !fog.visible.has(tile)) continue
		for (const t of unitThreatTiles(map, tile, unit)) out.add(t)
	}
	return out
}
