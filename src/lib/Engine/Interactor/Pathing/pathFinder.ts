import { unitData } from '$lib/GameData/unit'
import { drag, validTerrain } from './movement'
import { isJammedFor } from '$lib/Engine/modifiers/jamming'

const NO_CONCEALED: ReadonlySet<number> = new Set()

// `concealed` lists tiles the moving team can't perceive (fog / stealth — see
// `concealedEnemyTiles`). They're treated as empty so the route runs straight
// through them as if no enemy were there; the unit physically collides and stops
// when it actually walks in (the caller resolves that via
// `truncateRouteAtCollision`). Defaults to empty for callers with full-board
// knowledge (CPU planner, cosmetic animation routes).
export const pathFinder = (
	map: MapObject,
	unit: UnitObject,
	start: number,
	end: number,
	concealed: ReadonlySet<number> = NO_CONCEALED
): number[] => {
	if (start === end) return []

	const cols = map.cols
	const size = cols * map.rows

	const target = map.layers.units[end]
	// A concealed enemy on `end` is invisible to the mover, so route to it as a
	// plain destination tile rather than entering melee-approach mode.
	const targeting =
		!!target &&
		target.team !== unit.team &&
		unitData[unit.type].range[0] === 1 &&
		!concealed.has(end)
	const movement = unitData[unit.type].movement
	const isAir = unitData[unit.type].type === 'air'

	// Cheapest known drag to reach each tile, the step count along that route
	// (a tie-break so equal-cost paths still draw the straightest arrow), and the
	// tile we arrived from for reconstruction.
	//
	// This is a uniform-cost (Dijkstra) search, NOT a step-count BFS. Terrain drag
	// varies per unit — a Rocket Truck crosses canyon faster than plains — so the
	// route with the fewest tiles is frequently NOT the cheapest. A step-count
	// search settles tiles by the fewest-tiles route and can declare a tile
	// unreachable within budget that the movement-range flood-fill
	// (generateMovementList) correctly paints green, desyncing the green tiles
	// from the hover arrow and the committed move.
	const best = new Array<number>(size).fill(Infinity)
	const steps = new Array<number>(size).fill(Infinity)
	const prev = new Array<number>(size).fill(-1)
	best[start] = 0
	steps[start] = 0

	// Linear min-extraction is plenty for these board sizes.
	const frontier = new Set<number>([start])

	const passable = (tile: number): boolean => {
		const occupant = map.layers.units[tile]
		return !occupant || occupant.team === unit.team || concealed.has(tile)
	}

	while (frontier.size > 0) {
		let cur = -1
		for (const tile of frontier) {
			if (
				cur === -1 ||
				best[tile] < best[cur] ||
				(best[tile] === best[cur] && steps[tile] < steps[cur])
			) {
				cur = tile
			}
		}
		frontier.delete(cur)

		// A plain move settles the instant we pop its destination — Dijkstra
		// guarantees it's now at its cheapest cost.
		if (!targeting && cur === end) return reconstruct(prev, start, end)

		const cx = cur % cols
		const cy = Math.floor(cur / cols)

		for (const dir of [-cols, cols, -1, 1]) {
			const next = cur + dir
			if (next < 0 || next >= size) continue
			const nx = next % cols
			const ny = Math.floor(next / cols)
			if (Math.abs(nx - cx) + Math.abs(ny - cy) !== 1) continue // reject grid wrap-around

			// The enemy being attacked sits on `end`; we approach an adjacent tile
			// rather than stepping onto it, so never expand through it.
			if (targeting && next === end) continue
			if (!validTerrain(map.layers.ground[next], unit)) continue
			if (isAir && isJammedFor(map, next, unit.team)) continue
			if (!passable(next)) continue

			const cost = best[cur] + drag(unit, map.layers.ground[next], map.layers.sky[next])
			if (cost > movement) continue

			const stepCount = steps[cur] + 1
			if (cost < best[next] || (cost === best[next] && stepCount < steps[next])) {
				best[next] = cost
				steps[next] = stepCount
				prev[next] = cur
				frontier.add(next)
			}
		}
	}

	if (!targeting) return []

	// Attacking: strike from the cheapest reachable tile adjacent to the target.
	// Requires at least one step — an already-adjacent attacker fires in place, so
	// the source tile itself isn't a candidate (callers treat an empty path as
	// "don't move, just attack").
	const ex = end % cols
	const ey = Math.floor(end / cols)
	let approach = -1
	for (const dir of [-cols, cols, -1, 1]) {
		const adj = end + dir
		if (adj < 0 || adj >= size || adj === start) continue
		const ax = adj % cols
		const ay = Math.floor(adj / cols)
		if (Math.abs(ax - ex) + Math.abs(ay - ey) !== 1) continue
		if (best[adj] === Infinity) continue
		if (
			approach === -1 ||
			best[adj] < best[approach] ||
			(best[adj] === best[approach] && steps[adj] < steps[approach])
		) {
			approach = adj
		}
	}

	return approach === -1 ? [] : reconstruct(prev, start, approach)
}

const reconstruct = (prev: number[], start: number, end: number): number[] => {
	const path: number[] = []
	for (let tile = end; tile !== -1; tile = prev[tile]) {
		path.push(tile)
		if (tile === start) break
	}
	return path.reverse()
}
