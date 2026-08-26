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

// The Sea is the one terrain that does not end where the board does: the map is a
// window onto a coastline, so water running off the edge is open ocean continuing
// past it, not a shore. Every sea-border lookup (base frame, inner corners, beach
// caps, the underlay beneath obstacles and bridges) therefore answers "connected"
// for a neighbour outside the board, so a water tile on the border draws plain
// water instead of cutting a bank and its sliver of grass along the map's rim.
// Land terrains keep the old answer: a road or an ore bed genuinely stops there.
const OFF_MAP_WATER = true

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
		const inner = borderCornersWith(ocean, OFF_MAP_WATER)
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
// through>`. A cap is a whole-cell overlay (paint.FIRST_CAP_STATE) that is
// transparent wherever it should not repaint, so which corner of the tile it lands
// on is baked into the art. Kept in lockstep with
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
			left: left(map, location, ocean, OFF_MAP_WATER),
			right: right(map, location, ocean, OFF_MAP_WATER),
			top: up(map, location, ocean, OFF_MAP_WATER),
			bottom: down(map, location, ocean, OFF_MAP_WATER),
		}
		// A beach that runs out through the edge of the map is not running out at all:
		// off-map counts as open water above, so the sand has to count as carrying on
		// off-map too, or every coast would raise a headland right on the map's rim.
		const col = location % map.cols
		const row = (location / map.cols) | 0
		const carries = {
			left: col === 0 || beachContinues(ground, location - 1),
			right: col === map.cols - 1 || beachContinues(ground, location + 1),
			top: row === 0 || beachContinues(ground, location - map.cols),
			bottom: location + map.cols >= ground.length || beachContinues(ground, location + map.cols),
		}
		const caps: number[] = []
		for (const [edge, exits] of CAP_EXITS) {
			if (water[edge]) continue // that side is water: no beach along it to cap
			for (const exit of exits) {
				if (!water[exit] || carries[exit]) continue
				caps.push(CAP_STATE[`${edge}:${exit}`])
			}
		}
		// The inner corners need ending too, and the loop above cannot see them: it
		// only walks LAND-facing edges, so a beach whose sand comes from a diagonal
		// land tile — a tile with water on all four sides and a headland poking into
		// one corner — was capped nowhere at all and simply got sliced off at the
		// tile edge. A pocket's sand runs out through BOTH borders flanking its
		// corner, so each is capped on the same terms as an edge's.
		const diag = diagonal(ocean, OFF_MAP_WATER)
		for (const [corner, [a, b]] of POCKET_EXITS) {
			if (!water[a] || !water[b]) continue // not a corner overlay: an edge owns this
			if (diag(...CORNER_DIAGONAL[corner])(map, location)) continue // no land pocket
			// Both borders at once is ONE overlay, not two. Both would land on the same
			// quadrant, so the second would paint over the first and leave that border
			// uncapped — its sand cut flat at the tile edge, which against open Sea
			// reads as a slab of beach floating offshore.
			const ends = [a, b].filter((exit) => !carries[exit])
			if (ends.length === 0) continue
			caps.push(POCKET_CAP_STATE[`${corner}:${ends.length === 2 ? 'both' : ends[0]}`])
		}
		return caps
	}

// The inner-corner overlays (borderCornersWith below picks them), each with the two
// borders its land pocket sits between — which are exactly the two its beach runs
// out through — and the diagonal step to the land tile itself.
const POCKET_EXITS = [
	['tl', ['top', 'left']],
	['bl', ['bottom', 'left']],
	['br', ['bottom', 'right']],
	['tr', ['top', 'right']],
] as const satisfies readonly (readonly [
	string,
	readonly ('top' | 'bottom' | 'left' | 'right')[],
])[]
const CORNER_DIAGONAL: Record<string, [-1 | 1, -1 | 1]> = {
	tl: [-1, -1],
	bl: [1, -1],
	br: [1, 1],
	tr: [-1, 1],
}

// Sheet columns for the inner-corner caps, keyed `<corner>:<border it runs out
// through>`. Whole-cell overlays like the edge caps above. In lockstep with
// gen_terrain_shore.py's POCKET_CAP_EDGES.
const POCKET_CAP_STATE: Record<string, number> = {
	'tl:left': 28,
	'tl:top': 29,
	'tl:both': 30,
	'bl:left': 31,
	'bl:bottom': 32,
	'bl:both': 33,
	'br:right': 34,
	'br:bottom': 35,
	'br:both': 36,
	'tr:right': 37,
	'tr:top': 38,
	'tr:both': 39,
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
	(reader: Reader, offMap = false): CornerDecision =>
	(map, location) => {
		const l = left(map, location, reader, offMap)
		const u = up(map, location, reader, offMap)
		const r = right(map, location, reader, offMap)
		const d = down(map, location, reader, offMap)
		const diag = diagonal(reader, offMap)

		const corners: number[] = []
		if (u && l && !diag(-1, -1)(map, location)) corners.push(16) // top-left diagonal differs
		if (d && l && !diag(1, -1)(map, location)) corners.push(17) // bottom-left diagonal differs
		if (d && r && !diag(1, 1)(map, location)) corners.push(18) // bottom-right diagonal differs
		if (u && r && !diag(-1, 1)(map, location)) corners.push(19) // top-right diagonal differs
		return corners
	}

const singular: ConnectionDecision = (map, location) => 0

// A road or canyon that runs into the edge of the map should read as carrying on
// past it, not stopping dead in an end cap laid right on the border — the board is
// a window onto the world, and a highway does not simply stop because the window
// does. But a route may only leave through a border it was already heading for, or
// every tile along the map's rim would sprout a stub into the void and the coast
// road would look like a comb.
//
// So the test is per border, and it is the narrowest one that does the job: run
// through this edge only when the tile's sole in-map connection is the OPPOSITE
// side. That is exactly the cap-pointing-at-the-border case, and it becomes a
// straight. A route running ALONG the edge (connected up and down at the right
// border) fails it, as does a corner turning away and a junction already busy in
// three directions — all of them keep the border as their end.
//
// Judged from the in-map connections alone, so the four borders can't cascade: a
// route entering the top-left corner tile from the east and leaving south is an L,
// and stays one, rather than each missing side talking itself into a junction.
const continuesOffMap = (
	map: MapObject,
	location: number,
	l: boolean,
	u: boolean,
	r: boolean,
	d: boolean
) => {
	const col = location % map.cols
	const row = (location / map.cols) | 0
	return {
		left: col === 0 && r && !u && !d,
		right: col === map.cols - 1 && l && !u && !d,
		up: row === 0 && d && !l && !r,
		down: location + map.cols >= map.layers.ground.length && u && !l && !r,
	}
}

// Directional 16-frame autotile (indexed by `rollDecision`): the frame is chosen by
// which cardinal neighbours "connect" under `reader`. Roads connect along the path
// family; a bridge deck connects to any bank (see the readers below). `offMapEnds`
// lets a route run off the edge of the map where it was already headed there — see
// `continuesOffMap`; a bridge deck leaves it off, since its span ends on a bank.
const rollIntoWith =
	(reader: Reader, offMapEnds = false): ConnectionDecision =>
	(map, location) => {
		let l = left(map, location, reader)
		let u = up(map, location, reader)
		let r = right(map, location, reader)
		let d = down(map, location, reader)
		if (offMapEnds) {
			const off = continuesOffMap(map, location, l, u, r, d)
			l = l || off.left
			u = u || off.up
			r = r || off.right
			d = d || off.down
		}
		return rollDecision[l ? 'true' : 'false'][u ? 'true' : 'false'][r ? 'true' : 'false'][
			d ? 'true' : 'false'
		]
	}

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
	(reader: Reader, offMap = false): ConnectionDecision =>
	(map, location) =>
		borderDecision[left(map, location, reader, offMap) ? 'true' : 'false'][
			up(map, location, reader, offMap) ? 'true' : 'false'
		][right(map, location, reader, offMap) ? 'true' : 'false'][
			down(map, location, reader, offMap) ? 'true' : 'false'
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
	rollIntoWith(path, true),
	random,
	borderWith(ocean, OFF_MAP_WATER),
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
const seaBorder = borderWith(ocean, OFF_MAP_WATER)
const seaBorderCorners = borderCornersWith(ocean, OFF_MAP_WATER)

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

// Cardinal neighbour equality against `reader`. `offMap` is the answer when the
// neighbour would fall outside the board: false ("a different tile") for everything
// that ends at the border, true for the Sea, whose water is understood to carry on
// past the edge of the map (see OFF_MAP_WATER).
const up = (map: MapObject, location: number, reader: Reader = type, offMap = false) =>
	location - map.cols >= 0
		? reader(map.layers.ground, location - map.cols) === reader(map.layers.ground, location)
		: offMap
const down = (map: MapObject, location: number, reader: Reader = type, offMap = false) =>
	location + map.cols < map.layers.ground.length
		? reader(map.layers.ground, location + map.cols) === reader(map.layers.ground, location)
		: offMap

const left = (map: MapObject, location: number, reader: Reader = type, offMap = false) =>
	location % map.cols !== 0
		? reader(map.layers.ground, location - 1) === reader(map.layers.ground, location)
		: offMap
const right = (map: MapObject, location: number, reader: Reader = type, offMap = false) =>
	(location + 1) % map.cols !== 0
		? reader(map.layers.ground, location + 1) === reader(map.layers.ground, location)
		: offMap

// Diagonal neighbour equality against `reader` (ocean flag or terrain type), with
// explicit row/column bounds so a lookup never wraps onto the wrong row or reads
// out of bounds. Used only for inner-corner detection; off the edge of the map it
// answers `offMap` — false (a different tile) for a terrain that ends at the
// border, true for the Sea, whose water carries on past it.
const diagonal =
	(reader: Reader, offMap = false) =>
	(rowDelta: -1 | 1, colDelta: -1 | 1) =>
	(map: MapObject, location: number) => {
		const col = location % map.cols
		if (col + colDelta < 0 || col + colDelta >= map.cols) return offMap
		const target = location + rowDelta * map.cols + colDelta
		if (target < 0 || target >= map.layers.ground.length) return offMap
		return reader(map.layers.ground, target) === reader(map.layers.ground, location)
	}
