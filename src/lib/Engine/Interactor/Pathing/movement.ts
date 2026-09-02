import { skyData } from '$lib/GameData/sky'
import { terrainData } from '$lib/GameData/terrain'
import { unitData } from '$lib/GameData/unit'
import { isJammedFor } from '$lib/Engine/modifiers/jamming'

const NO_CONCEALED: ReadonlySet<number> = new Set()

// `concealed` lists tiles the moving team can't perceive (fog / stealth — see
// `concealedEnemyTiles`). Pathing treats them as empty: a unit routes through and
// can target them as destinations as if no enemy were there, so a blocked path
// never betrays a hidden unit's position. Defaults to empty — callers that know
// the full board (e.g. the CPU planner) get the old "every enemy blocks" behavior.
// Uniform-cost (Dijkstra) flood fill of every tile `unit` can reach from `tile`
// within its movement budget, settling each tile exactly once.
//
// This replaced a recursive descent that expanded all four directions from every
// tile with NO visited-tracking — an O(4^movement) walk that rebuilt arrays via
// spreads at each node and only deduped at the end. On a 20x20 board a mid-range
// walker locked the UI for seconds; the cost is why bigger walk ranges froze
// longer. The reachable SET here is identical to the old flood fill: terrain drag
// is non-negative, so if any path reached a tile within budget, its cheapest path
// (the one Dijkstra settles) does too.
export const generateMovementList = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	concealed: ReadonlySet<number> = NO_CONCEALED
) => {
	const best = floodMoveCosts(map, [tile], unit, concealed, unitData[unit.type].movement)

	// The start tile is always included (the unit stands there). Every other
	// reachable tile passes through removeOccupied: you can path THROUGH a friendly
	// or concealed tile but can't stop on one a visible unit occupies. Sorted
	// ascending to preserve the old array-scan ordering, so any downstream tie-break
	// (e.g. the CPU picking the first of several equal-score destinations) is
	// unchanged.
	const reachable = [...best.keys()].sort((a, b) => a - b)
	return [...new Set([tile, ...removeOccupied(map, reachable, concealed)])]
}

// The Dijkstra core behind `generateMovementList`, exposed for callers that want
// the COSTS rather than the reachable set — the CPU's ferry-gain primitive floods
// from every objective at once with no budget to learn how far each tile is on
// foot (see cpuAi/evaluate.ts). Returns the cheapest drag to reach every settled
// tile from any of `starts`; `budget` bounds the flood (Infinity = the whole map).
export const floodMoveCosts = (
	map: MapObject,
	starts: readonly number[],
	unit: UnitObject,
	concealed: ReadonlySet<number> = NO_CONCEALED,
	budget: number = unitData[unit.type].movement
): Map<number, number> => {
	const cols = map.cols
	const rows = map.rows

	// `best` is a sparse Map, not a full-board array: a Dijkstra flood only ever
	// touches tiles within `budget` drag of the start, so its footprint is the
	// reachable area (roughly range²), never the map. The old `new Array(cols*rows)`
	// + final 0..size scan made every call O(map tiles) — a mid-range walker on a
	// 300×300 board allocated and swept 90k cells to answer a ~30-tile question,
	// which is exactly what stalled the movement-range preview and multiplied the
	// CPU's per-unit cost. Settled tiles are collected as they're first reached, so
	// we never scan unreached ground.
	const best = new Map<number, number>()
	const heap = new MinHeap()
	for (const start of starts) {
		best.set(start, 0)
		heap.push(start, 0)
	}

	while (heap.size > 0) {
		const { node: cur, cost } = heap.pop()
		// Lazily-deleted stale entry: a cheaper route to `cur` was found after this
		// one was queued, so skip re-expanding from the outdated cost.
		if (cost > (best.get(cur) ?? Infinity)) continue

		const cx = cur % cols
		const cy = (cur - cx) / cols
		for (let dir = 0; dir < 4; dir++) {
			let next: number
			// In-bounds neighbour with no grid wrap-around (a left step from column 0
			// must not land on the previous row's last column).
			if (dir === 0) {
				if (cx + 1 >= cols) continue
				next = cur + 1
			} else if (dir === 1) {
				if (cx === 0) continue
				next = cur - 1
			} else if (dir === 2) {
				if (cy === 0) continue
				next = cur - cols
			} else {
				if (cy + 1 >= rows) continue
				next = cur + cols
			}

			if (!validTerrain(map.layers.ground[next], unit)) continue
			if (!notBlocked(map, next, unit, concealed)) continue
			if (!notJammed(map, next, unit)) continue

			const nc = cost + drag(unit, map.layers.ground[next], map.layers.sky[next])
			if (nc > budget) continue
			if (nc < (best.get(next) ?? Infinity)) {
				best.set(next, nc)
				heap.push(next, nc)
			}
		}
	}
	return best
}

const removeOccupied = (map: MapObject, tiles: number[], concealed: ReadonlySet<number>) =>
	tiles.filter((tile) => !map.layers.units[tile] || concealed.has(tile))

// Binary min-heap over (tile, cost) — the priority queue for the Dijkstra flood
// fill above. Parallel arrays avoid per-node object allocation on the hot path.
class MinHeap {
	private nodes: number[] = []
	private costs: number[] = []

	get size(): number {
		return this.nodes.length
	}

	push(node: number, cost: number): void {
		this.nodes.push(node)
		this.costs.push(cost)
		let i = this.nodes.length - 1
		while (i > 0) {
			const parent = (i - 1) >> 1
			if (this.costs[parent] <= this.costs[i]) break
			this.swap(i, parent)
			i = parent
		}
	}

	pop(): { node: number; cost: number } {
		const node = this.nodes[0]
		const cost = this.costs[0]
		const lastNode = this.nodes.pop() as number
		const lastCost = this.costs.pop() as number
		const n = this.nodes.length
		if (n > 0) {
			this.nodes[0] = lastNode
			this.costs[0] = lastCost
			let i = 0
			for (;;) {
				const l = i * 2 + 1
				const r = l + 1
				let smallest = i
				if (l < n && this.costs[l] < this.costs[smallest]) smallest = l
				if (r < n && this.costs[r] < this.costs[smallest]) smallest = r
				if (smallest === i) break
				this.swap(i, smallest)
				i = smallest
			}
		}
		return { node, cost }
	}

	private swap(a: number, b: number): void {
		const tn = this.nodes[a]
		this.nodes[a] = this.nodes[b]
		this.nodes[b] = tn
		const tc = this.costs[a]
		this.costs[a] = this.costs[b]
		this.costs[b] = tc
	}
}

const notJammed = (map: MapObject, tile: number, unit: UnitObject): boolean => {
	if (unitData[unit.type].type !== 'air') return true
	return !isJammedFor(map, tile, unit.team)
}

const IMPASSABLE = 9999
export const drag = (unit: UnitObject, terrain: GroundObject, sky?: SkyObject | null) => {
	const u = unitData[unit.type]
	const t = terrainData[terrain.type]
	// Air units answer to the SKY layer, not the ground: every weather carries its
	// own flight cost (Turbulence 3, Jetstream 0.5, open sky 1). A Storm_Rider
	// ignores the drag of treacherous weather only — ordinary wind still applies.
	if (u.type === 'air') {
		const weather = sky ? skyData[sky.type] : undefined
		if (!weather) return 1
		if (weather.modifiers.includes('treacherous') && u.modifiers.includes('Storm_Rider')) return 1
		return weather.drag
	}
	// Sure-footed walkers (Strider) treat every passable tile the same — no rough,
	// slippery or rugged penalty and no terrain-drag scaling. They climb mountains
	// as easily as crossing a road; ocean is still gated off by validTerrain.
	if (u.movementType === 'sure-footed') return 1
	// Hovercraft skim land and shallows freely but plough slowly through open ocean
	// (deep water that isn't a Shallow shore/port). Scales by terrain drag so reefs
	// and archipelago still bite.
	if (u.movementType === 'amphibious')
		return (t.ocean && !t.modifiers.includes('Shallow') ? 2 : 1) * t.drag
	// Tires cross rough terrain (hills, forest) poorly, but the 3x penalty already IS
	// the final cost — it must NOT also be scaled by the terrain's own `drag`, or a
	// wheel unit would spend its entire move climbing a single hill (3 * drag 2 = 6).
	// Every other movement type still scales by terrain drag below.
	if (t.details === 'rough' && u.movementType === 'wheel') return 3
	return (
		// Shallow water (Shore) bottoms out a deep-draft warship; a High Bridge spans
		// deep water, so it isn't Shallow and ships pass freely beneath it.
		((t.modifiers.includes('Shallow') && u.movementType === 'warship') ||
		(t.details === 'rugged' && (u.movementType === 'wheel' || u.movementType === 'tank'))
			? IMPASSABLE
			: t.details === 'rough' && u.movementType === 'boat'
				? 3
				: (t.details === 'slippery' && u.movementType === 'foot') ||
					  (t.details === 'dirty' && u.movementType === 'wheel')
					? 2
					: 1) * t.drag
	)
}

const notBlocked = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	concealed: ReadonlySet<number>
) => !map.layers.units[tile] || map.layers.units[tile]?.team === unit.team || concealed.has(tile)

// Stops `route` at the first tile occupied by an enemy of `team`, returning the
// route up to (but not including) that tile and flagging the collision. Pathing
// only ever routes a unit through enemies it couldn't see (concealed by fog or
// stealth), so any enemy met mid-route is one the player walked into blind: the
// unit halts on the last clear tile and its turn ends. `blocked` is the tile it ran
// into (always the next step after the truncated route, so orthogonally adjacent
// to its final tile) — the animator lunges the halted unit at it so the stop reads
// as a collision. A clean route comes back unchanged with `collided: false`.
export const truncateRouteAtCollision = (
	map: MapObject,
	route: number[],
	team: number
): { route: number[]; collided: boolean; blocked?: number } => {
	for (let i = 1; i < route.length; i++) {
		const occupant = map.layers.units[route[i]]
		if (occupant && occupant.team !== team) {
			return { route: route.slice(0, i), collided: true, blocked: route[i] }
		}
	}
	return { route, collided: false }
}

export const validTerrain = (terrain: GroundObject, unit: UnitObject) => {
	const u = unitData[unit.type]
	const t = terrainData[terrain.type]
	if (u.movementType === 'none') return false
	if (t.details === 'impassable') return false
	if (u.type === 'air') return true
	// Hovercraft go anywhere that isn't impassable — land, shore and open water alike.
	if (u.movementType === 'amphibious') return true
	// Amphibious terrain (Shore, High Bridge) takes both ground and sea: ground units
	// cross the deck/sand while ships occupy the water, so both are allowed (a plain
	// Bridge sits low and blocks ships — it isn't Amphibious).
	if (t.modifiers.includes('Amphibious')) return u.type === 'ground' || u.type === 'sea'
	if (t.ocean) return u.type === 'sea'
	return u.type === 'ground'
}

// Whether `unit` could legally occupy `terrain` — used by the map editor to reject
// nonsensical placements (a ground unit on the sea, a ship on grass, anything on a
// volcano, a tank on a mountain). It mirrors the in-match passability rules
// (`validTerrain`'s terrain gate plus the impassable `drag` check that `landTiles`
// relies on) but, unlike `validTerrain`, permits immobile units (Turrets, Blockades)
// which can never "move" yet still belong on the board.
export const canPlaceUnit = (terrain: GroundObject, unit: UnitObject, sky?: SkyObject | null) => {
	const u = unitData[unit.type]
	const t = terrainData[terrain.type]
	if (t.details === 'impassable') return false
	if (u.type === 'air') return true
	const terrainAllows =
		u.movementType === 'amphibious'
			? true
			: t.modifiers.includes('Amphibious')
				? u.type === 'ground' || u.type === 'sea'
				: t.ocean
					? u.type === 'sea'
					: u.type === 'ground'
	if (!terrainAllows) return false
	// Even on type-compatible terrain, a unit's movement type may be unable to
	// traverse it (a tank on a mountain, a warship on a shore): an impassable move
	// cost means it could never stand there, so it can't be placed there either.
	return drag(unit, terrain, sky ?? undefined) < 100
}
