/* eslint-disable @typescript-eslint/no-unused-vars */
import { terrainData } from '$lib/GameData/terrain'
import { skyData } from '$lib/GameData/sky'

type ConnectionDecision = (map: MapObject, location: number) => number
type CornerDecision = (map: MapObject, location: number) => number[]

// Neighbour-equality readers. `type` matches identical terrain (rollInto / the
// Charred Forest scar), `ocean` matches any water body (the Sea border). Defined up
// here because `flowDecision` binds them into its border decisions at module load.
const type = (map: GroundObject[], location: number) => map[location].type

// A bridge deck spans open water and bakes its own banks into the sprite, so for
// coastline autotiling it reads as water: neighbouring sea flows straight under the
// deck instead of drawing a shoreline (and its diagonal inner-corners) against it.
// Gameplay still treats a low Bridge as non-ocean — this only affects how the
// surrounding water tiles pick their border frames. Connector 4 is Bridge / High
// Bridge (see `flowDecision`).
const ocean = (map: GroundObject[], location: number) => {
	const t = terrainData[map[location].type]
	return t.ocean || t.connector === 4
}

// Road decks and both bridge kinds form one continuous path, so a road autotiles
// straight onto a bridge (and vice versa) instead of dead-ending at the bank.
// Canyon shares connector 1 (`rollInto`) but stays out of the family, so it keeps
// matching only its own type. `PATH_TOKEN` is a sentinel below the 0-based type
// range so it can never collide with a real terrain index.
const PATH_TOKEN = -1
const isPath = (t: number) => terrainData[t].name === 'Road' || terrainData[t].connector === 4
const path = (map: GroundObject[], location: number) => {
	const t = map[location].type
	return isPath(t) ? PATH_TOKEN : t
}

// A beach knows where it ENDS, which the `ocean` reader above cannot tell it:
// `ocean` folds Sea and Shore into one body of water, so a beach tile reads its
// neighbouring Sea as "connected" and lays sand right up to the border, where the
// Sea tile draws a cliff instead. `beachContinues` is the second opinion — true
// only where the sand genuinely carries on. A bridge deck counts, because it bakes
// its own banks and the beach simply runs under the span.
const beachContinues = (map: GroundObject[], location: number) => {
	const t = terrainData[map[location].type]
	return t.beach === true || t.connector === 4
}

// The reader behind the connector-5 border. Terrains that declare the same
// `TerrainData.family` autotile as ONE body: the three Ore Deposits are a single
// mineral bed at three stages of being mined out, so a rich patch and a worked-out
// one share a continuous rim rather than each cutting its own edge into the other.
// A terrain with no family falls back to its own index, which is exactly the plain
// type-matching the Charred Forest scar and Wasteland want — so this generalises
// connector 5 without changing what a family-less terrain does.
//
// Family tokens are negative so they can never collide with a real terrain index,
// and the table is built once at module load since `terrainData` is static.
const familyToken: number[] = (() => {
	const ids = new Map<string, number>()
	return terrainData.map((t, index) => {
		if (!t.family) return index
		if (!ids.has(t.family)) ids.set(t.family, -100 - ids.size)
		return ids.get(t.family) as number
	})
})()
const family = (map: GroundObject[], location: number) => familyToken[map[location].type]

type Reader = (map: GroundObject[], location: number) => number | boolean

export const connectionDecision = (object: GroundObject) =>
	flowDecision[terrainData[object.type].connector]

// A single tile renders one sprite frame, so the base `state` can only ever show
// one of the four inner corners (16=TL, 17=BL, 18=BR, 19=TR). Coastlines like
//   G S G        G S S
//   S S S   or   S S S
//   G S G        G S S
// need several inner corners on the same water tile, so we return the full list
// here and let the renderer composite each corner's quadrant over the base tile.
// connector 3 (Sea) borders against the `ocean` flag so every water terrain reads
// as one body; connector 5 (Charred Forest, Wasteland, the Ore Deposits) borders
// against terrain *family*, which is a terrain's own type unless it declares one —
// so a burn scar autotiles only against itself while the three ore richnesses
// autotile as one bed. Both share the border-base + inner-corner machinery below,
// just with a different neighbour-equality reader.
export const cornerDecision = (object: GroundObject): CornerDecision => {
	const connector = terrainData[object.type].connector
	if (connector === 3) {
		const inner = borderCornersWith(ocean)
		// A beach also needs its ends. Both kinds of overlay are quadrant copies over
		// the base tile (paint.corners), so they travel in one list.
		if (terrainData[object.type].beach) {
			const caps = capDecision(object)
			return (map, location) => [...inner(map, location), ...caps(map, location)]
		}
		return inner
	}
	if (connector === 5) return borderCornersWith(family)
	return noCorners
}

// Sheet columns for the beach end caps, keyed `<land edge>:<border it runs out
// through>`. Kept in lockstep with paint.cornerQuadrant and
// tools/sprites/gen_terrain_shore.py's CAP_EDGES.
const CAP_STATE: Record<string, number> = {
	'top:left': 20,
	'top:right': 21,
	'bottom:left': 22,
	'bottom:right': 23,
	'left:top': 24,
	'left:bottom': 25,
	'right:top': 26,
	'right:bottom': 27,
}

// Which tile borders a beach runs out through, and so where it has to raise a
// headland instead of spilling its sand into open water.
//
// The beach hugs each LAND-facing edge, and that band leaves the tile through the
// two borders running perpendicular to it. Take a tile with land above: its beach
// runs along the top and exits left and right. Through each of those borders the
// sand either carries on (the neighbour is beach too — nothing to draw, the two
// tiles' coastlines already meet) or it stops dead against deep water, and that is
// where the cap goes. A border facing land isn't an exit at all: the beach turns
// the corner there and the base state has already drawn it.
const capDecision =
	(object: GroundObject): CornerDecision =>
	(map, location) => {
		const ground = map.layers.ground
		const water = {
			left: left(map, location, ocean),
			right: right(map, location, ocean),
			top: up(map, location, ocean),
			bottom: down(map, location, ocean),
		}
		// Off the edge of the map reads as land (left/right/up/down are false there),
		// so a beach running to the map border is capped by the border itself.
		const col = location % map.cols
		const row = (location / map.cols) | 0
		const carries = {
			left: col > 0 && beachContinues(ground, location - 1),
			right: col < map.cols - 1 && beachContinues(ground, location + 1),
			top: row > 0 && beachContinues(ground, location - map.cols),
			bottom: location + map.cols < ground.length && beachContinues(ground, location + map.cols),
		}
		const caps: number[] = []
		for (const [edge, exits] of CAP_EXITS) {
			if (water[edge]) continue // that side is water: no beach along it to cap
			for (const exit of exits) {
				if (!water[exit] || carries[exit]) continue
				caps.push(CAP_STATE[`${edge}:${exit}`])
			}
		}
		return caps
	}

// Each land-facing edge, with the two borders its beach band runs out through.
const CAP_EXITS = [
	['top', ['left', 'right']],
	['bottom', ['left', 'right']],
	['left', ['top', 'bottom']],
	['right', ['top', 'bottom']],
] as const satisfies readonly (readonly [
	'top' | 'bottom' | 'left' | 'right',
	readonly ('top' | 'bottom' | 'left' | 'right')[],
])[]

const noCorners: CornerDecision = () => []

// Inner corners for a border-autotiled tile read against `reader`. A corner is
// needed wherever a *different* neighbour pokes diagonally into a tile whose two
// flanking cardinals both match: the base border state assumes an open diagonal, so
// without this the square's corner would be cut. Judged per corner so it works for
// any shape (fully enclosed → all four, a concave notch → one). For water the
// "different" diagonal is land; for a burn scar it's grass.
const borderCornersWith =
	(reader: Reader): CornerDecision =>
	(map, location) => {
		const l = left(map, location, reader)
		const u = up(map, location, reader)
		const r = right(map, location, reader)
		const d = down(map, location, reader)
		const diag = diagonal(reader)

		const corners: number[] = []
		if (u && l && !diag(-1, -1)(map, location)) corners.push(16) // top-left diagonal differs
		if (d && l && !diag(1, -1)(map, location)) corners.push(17) // bottom-left diagonal differs
		if (d && r && !diag(1, 1)(map, location)) corners.push(18) // bottom-right diagonal differs
		if (u && r && !diag(-1, 1)(map, location)) corners.push(19) // top-right diagonal differs
		return corners
	}

const singular: ConnectionDecision = (map, location) => 0

// Directional 16-frame autotile (indexed by `rollDecision`): the frame is chosen by
// which cardinal neighbours "connect" under `reader`. Roads connect along the path
// family; a bridge deck connects to any bank (see the readers below).
const rollIntoWith =
	(reader: Reader): ConnectionDecision =>
	(map, location) =>
		rollDecision[left(map, location, reader) ? 'true' : 'false'][
			up(map, location, reader) ? 'true' : 'false'
		][right(map, location, reader) ? 'true' : 'false'][
			down(map, location, reader) ? 'true' : 'false'
		]

// `location % 5` walks 0,1,2,3,4,0,1… straight across each row, so adjacent tiles
// almost always differ by exactly one frame and the map reads as diagonal stripes.
// Instead mix the row and column through an integer hash before folding to 5 frames:
// the result is still a pure function of the tile's position (so a tile keeps its
// frame across reloads) but neighbours land on uncorrelated frames, which reads as
// random scatter without ever storing per-tile state.
const positionHash = (map: MapObject, location: number) => {
	const col = location % map.cols
	const row = (location / map.cols) | 0
	let h = (col * 0x1f1f1f1f) ^ (row * 0x27d4eb2d)
	h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
	h ^= h >>> 13
	return h >>> 0
}

const random: ConnectionDecision = (map, location) => positionHash(map, location) % 5

// Which variant block of the sheet a tile draws from, for a terrain that ships
// several (TerrainData.variants). Autotiling picks a tile's SHAPE; this picks which
// version of that shape it wears, so a long beach reads as one coast that keeps
// changing rather than one motif stamped out N times. Uses the same position hash
// as `random` above: stable across reloads, uncorrelated between neighbours.
export const variantDecision =
	(object: GroundObject) =>
	(map: MapObject, location: number): number => {
		const count = terrainData[object.type].variants ?? 1
		return count > 1 ? positionHash(map, location) % count : 0
	}

const borderWith =
	(reader: Reader): ConnectionDecision =>
	(map, location) =>
		borderDecision[left(map, location, reader) ? 'true' : 'false'][
			up(map, location, reader) ? 'true' : 'false'
		][right(map, location, reader) ? 'true' : 'false'][
			down(map, location, reader) ? 'true' : 'false'
		]

// A bridge deck lands on any solid bank (or another path/bridge tile) and spans
// only open water, so for the deck autotile a neighbour "connects" when it is NOT
// open water. This reads the RAW ocean flag rather than the `ocean` coastline
// reader above (which counts a bridge as water) so two stacked bridge tiles still
// read as connected to each other. A normal river crossing has banks on one axis
// and water on the other, so it resolves to a straight deck; a bend or junction
// only appears where three-plus sides are solid.
const landward = (map: GroundObject[], location: number) =>
	terrainData[map[location].type].ocean ? 0 : 1

// Indexed by TerrainData.connector: 0 singular, 1 rollInto (path family), 2 random,
// 3 sea-border (ocean), 4 bridge deck (rollInto against banks), 5 family-border (a
// scar, a blighted patch or an ore bed autotiling against everything in its family,
// which is its own type unless it declares one).
const flowDecision: ConnectionDecision[] = [
	singular,
	rollIntoWith(path),
	random,
	borderWith(ocean),
	rollIntoWith(landward),
	borderWith(family),
]

// Reef, Archipelago and Rock Formation are singular obstacle sprites flagged
// `ocean` (see terrainData): the surrounding Sea coastline flows straight *under*
// them (the `ocean` reader counts them as water) and, being singular (connector 0),
// they paint no shoreline of their own. Their sprites' water background is knocked
// out to transparency (see tools/sprites/gen_terrain_sea_obstacles.py) so the
// renderer draws a Sea tile beneath them and only the reef/rock feature on top —
// otherwise the obstacle's own baked water covered the shore (and inner-corner land)
// a Sea tile beneath it would draw, leaving a gap against the bank.
//
// This returns the Sea tile to draw underneath as a border `state` + inner `corners`,
// computed exactly as a Sea tile would (borderWith / borderCornersWith against
// `ocean`), or null when the tile isn't an ocean obstacle. In open water this is
// state 0 (plain water) — still needed, since the obstacle is transparent and has no
// water of its own anymore.
const isOceanObstacle = (t: number) => terrainData[t].ocean && terrainData[t].connector === 0
// Bridge / High Bridge (connector 4): their deck sprites are cut out over transparent
// water too (see tools/sprites/gen_bridge.py), so they ride the same Sea underlay — the
// water (and the shore where the deck meets a bank) reads beneath the span. Unlike an
// obstacle the deck draws full size, not shrunk (see paint.ts groundLayer).
const isBridge = (t: number) => terrainData[t].connector === 4
const seaBorder = borderWith(ocean)
const seaBorderCorners = borderCornersWith(ocean)

export const seaUnderlayDecision =
	(object: GroundObject) =>
	(map: MapObject, location: number): { state: number; corners: number[] } | null => {
		if (!isOceanObstacle(object.type) && !isBridge(object.type)) return null
		return { state: seaBorder(map, location), corners: seaBorderCorners(map, location) }
	}

const rollDecision = {
	true: {
		true: {
			true: {
				true: 5,
				false: 6,
			},
			false: {
				true: 4,
				false: 3,
			},
		},
		false: {
			true: {
				true: 8,
				false: 2,
			},
			false: {
				true: 11,
				false: 1,
			},
		},
	},
	false: {
		true: {
			true: {
				true: 7,
				false: 9,
			},
			false: {
				true: 12,
				false: 13,
			},
		},
		false: {
			true: {
				true: 10,
				false: 14,
			},
			false: {
				true: 15,
				false: 0,
			},
		},
	},
}
const borderDecision = {
	true: {
		true: {
			true: {
				true: 0,
				false: 4,
			},
			false: {
				true: 3,
				false: 12,
			},
		},
		false: {
			true: {
				true: 2,
				false: 15,
			},
			false: {
				true: 5,
				false: 8,
			},
		},
	},
	false: {
		true: {
			true: {
				true: 1,
				false: 13,
			},
			false: {
				true: 14,
				false: 9,
			},
		},
		false: {
			true: {
				true: 6,
				false: 7,
			},
			false: {
				true: 10,
				false: 11,
			},
		},
	},
}

// --- Sky-layer autotiling -------------------------------------------------
// Same rollInto scheme as the ground, but neighbours are read off the SKY layer
// and "connected" means the adjacent tile holds the SAME weather type. Only
// weathers with connector 1 (Jetstream) roll into a directional network; every
// other weather stays singular (state 0), so its one-column sheet is untouched.
// The sky layer is sparse (null where there's no weather), so a null neighbour
// simply never matches — the flow ends cleanly at the edge of the band.
const skyEq = (map: MapObject, a: number, b: number) => {
	const here = map.layers.sky[a]?.type
	return here != null && here === map.layers.sky[b]?.type
}
const skyUp = (map: MapObject, l: number) => l - map.cols >= 0 && skyEq(map, l, l - map.cols)
const skyDown = (map: MapObject, l: number) =>
	l + map.cols < map.layers.ground.length && skyEq(map, l, l + map.cols)
const skyLeft = (map: MapObject, l: number) => l % map.cols !== 0 && skyEq(map, l, l - 1)
const skyRight = (map: MapObject, l: number) => (l + 1) % map.cols !== 0 && skyEq(map, l, l + 1)

export const skyConnectionDecision =
	(object: SkyObject) =>
	(map: MapObject, location: number): number =>
		skyData[object.type]?.connector === 1
			? rollDecision[skyLeft(map, location) ? 'true' : 'false'][
					skyUp(map, location) ? 'true' : 'false'
				][skyRight(map, location) ? 'true' : 'false'][skyDown(map, location) ? 'true' : 'false']
			: 0

// Autotiling picks a tile's SHAPE from its neighbours, but a directional weather
// (the Jetstream) also has to run one consistent way along the whole band, or
// each cap and turn animates against its neighbours (a source cap that sucks
// inward, a corner that flows uphill). The sprite bakes ONE flow direction per
// shape; when the actual flow runs the other way we flip it 180° by playing the
// loop backwards (`flowReversed`).
//
// Direction comes from a flow bias — jetstreams run east, then south — so a
// tile's downstream edge is the connected edge with the highest priority below.
// That resolves every straight, corner and cap on a path. Baked directions (from
// gen_weather.py): straight-H flows to R, straight-V to D, a corner flows to its
// vertical edge, a cap flows inward (edge -> centre). We reverse when the baked
// direction disagrees with the bias. Junctions (3+ connections) carry more than
// one flow at once, which a single flip can't express, so they stay unflipped.
const SKY_FLOW_PRIORITY: Record<string, number> = { R: 3, D: 2, U: 1, L: 0 }

export const skyFlowReversed =
	(object: SkyObject) =>
	(map: MapObject, location: number): boolean => {
		if (skyData[object.type]?.connector !== 1) return false
		const l = skyLeft(map, location)
		const u = skyUp(map, location)
		const r = skyRight(map, location)
		const d = skyDown(map, location)
		const count = (l ? 1 : 0) + (u ? 1 : 0) + (r ? 1 : 0) + (d ? 1 : 0)
		if (count === 1) {
			// Cap: the lone edge points at the neighbour. If that neighbour is
			// downstream (east/south) this tile is the SOURCE and must flow OUT, but
			// the sprite flows inward — so reverse. An upstream (west/north) neighbour
			// makes it the sink, which the inward sprite already matches.
			const edge = l ? 'L' : u ? 'U' : r ? 'R' : 'D'
			return edge === 'R' || edge === 'D'
		}
		if (count === 2) {
			if (l && r) return false // straight-H: baked L->R already runs to downstream R
			if (u && d) return false // straight-V: baked U->D already runs to downstream D
			// Corner: sprite flows to its vertical edge; reverse if the horizontal
			// edge is actually the downstream one.
			const vSide = u ? 'U' : 'D'
			const hSide = l ? 'L' : 'R'
			return SKY_FLOW_PRIORITY[hSide] > SKY_FLOW_PRIORITY[vSide]
		}
		return false
	}

const up = (map: MapObject, location: number, reader: Reader = type) =>
	location - map.cols >= 0 &&
	reader(map.layers.ground, location - map.cols) === reader(map.layers.ground, location)
const down = (map: MapObject, location: number, reader: Reader = type) =>
	location + map.cols < map.layers.ground.length &&
	reader(map.layers.ground, location + map.cols) === reader(map.layers.ground, location)

const left = (map: MapObject, location: number, reader: Reader = type) =>
	location % map.cols !== 0 &&
	reader(map.layers.ground, location - 1) === reader(map.layers.ground, location)
const right = (map: MapObject, location: number, reader: Reader = type) =>
	(location + 1) % map.cols !== 0 &&
	reader(map.layers.ground, location + 1) === reader(map.layers.ground, location)

// Diagonal neighbour equality against `reader` (ocean flag or terrain type), with
// explicit row/column bounds so a lookup never wraps onto the wrong row or reads
// out of bounds. Used only for inner-corner detection; `false` (treat as a
// different tile) is the safe answer off the edge of the map.
const diagonal =
	(reader: Reader) =>
	(rowDelta: -1 | 1, colDelta: -1 | 1) =>
	(map: MapObject, location: number) => {
		const col = location % map.cols
		if (col + colDelta < 0 || col + colDelta >= map.cols) return false
		const target = location + rowDelta * map.cols + colDelta
		if (target < 0 || target >= map.layers.ground.length) return false
		return reader(map.layers.ground, target) === reader(map.layers.ground, location)
	}
