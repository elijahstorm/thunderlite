import { applyAction } from '../applyAction'

export type SerializedAction =
	// `path` is the exact route the mover walked, `from` first and `to` last.
	// Without it every other client (and the replay) had to re-derive a route with
	// `pathFinder`, which returns whichever equal-cost route its search settles
	// first — so a player who deliberately steered right-then-up was shown
	// up-then-right everywhere else, over completely different ground. Optional:
	// events logged before this field existed, and moves minted without a walked
	// route, still fall back to pathfinding. Purely choreography — `applyAction`
	// reads only `from`/`to`, so a move replays to the same board with or without it.
	| { kind: 'move'; from: number; to: number; path?: number[] }
	| { kind: 'attack'; from: number; to: number }
	| { kind: 'capture'; tile: number }
	| { kind: 'build'; building: number; unitType: number; direction?: number }
	// A Warmachine building an adjacent unit out of its own wallet (vs. `build`,
	// which spawns from a factory using the player pool). `builder` is the
	// Warmachine's tile; `destination` is an optional preferred deploy tile.
	| { kind: 'build-adjacent'; builder: number; unitType: number; destination?: number }
	| { kind: 'mine'; tile: number }
	| { kind: 'repair'; tile: number }
	| { kind: 'transport-load'; transport: number; passenger: number }
	| { kind: 'transport-unload'; transport: number; tile: number }
	| { kind: 'wait'; tile: number }
	// `next` is the team this client's engine advanced to (see socketEndTurn). It
	// is advisory metadata for the SERVER's turn pointer, not something the engine
	// reads back — `applyAction` ignores it and re-derives the rotation itself, so
	// a logged end-turn replays identically with or without it.
	| { kind: 'end-turn'; next?: number }
	| { kind: 'surrender'; team: number }

export type GameEvent = {
	id: number
	userSession: string
	action: SerializedAction
	ts: number
}

const isTile = (v: unknown): v is number =>
	typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isInteger(v)

/**
 * Generous cap on a relayed move route. The longest walk any unit can make is its
 * movement budget plus one tile, and the fastest unit in the game moves 9 — so
 * this is far above anything legitimate, and only exists so a hand-crafted
 * payload can't push an unbounded array into the room's event log.
 */
const MAX_ROUTE_TILES = 256

/**
 * A relayed walk route: tiles, at least two of them, starting on `from` and
 * ending on `to`. Step adjacency is deliberately NOT checked here — this runs on
 * the server too, which has no board and therefore no column count. The client
 * re-checks the chain against its own map before animating it (see
 * `animateRemoteAction`) and pathfinds instead if it doesn't hold up.
 */
const isRoute = (value: unknown, from: number, to: number): boolean =>
	Array.isArray(value) &&
	value.length >= 2 &&
	value.length <= MAX_ROUTE_TILES &&
	value[0] === from &&
	value[value.length - 1] === to &&
	value.every(isTile)

export const isValidSerializedAction = (value: unknown): value is SerializedAction => {
	if (!value || typeof value !== 'object') return false
	const v = value as Record<string, unknown>
	switch (v.kind) {
		case 'move': {
			const { from, to, path } = v
			if (!isTile(from) || !isTile(to)) return false
			return path === undefined || isRoute(path, from, to)
		}
		case 'attack':
			return isTile(v.from) && isTile(v.to)
		case 'capture':
		case 'mine':
		case 'repair':
		case 'wait':
			return isTile(v.tile)
		case 'build':
			return (
				isTile(v.building) &&
				typeof v.unitType === 'number' &&
				Number.isFinite(v.unitType) &&
				v.unitType >= 0 &&
				(v.direction === undefined ||
					(typeof v.direction === 'number' && Number.isFinite(v.direction)))
			)
		case 'build-adjacent':
			return (
				isTile(v.builder) &&
				typeof v.unitType === 'number' &&
				Number.isFinite(v.unitType) &&
				v.unitType >= 0 &&
				(v.destination === undefined || isTile(v.destination))
			)
		case 'transport-load':
			return isTile(v.transport) && isTile(v.passenger)
		case 'transport-unload':
			return isTile(v.transport) && isTile(v.tile)
		case 'end-turn':
			return (
				v.next === undefined ||
				(typeof v.next === 'number' && Number.isInteger(v.next) && v.next >= 0)
			)
		case 'surrender':
			return isTile(v.team)
	}
	return false
}

export const normalizeAction = (raw: unknown): SerializedAction | null => {
	if (isValidSerializedAction(raw)) return raw
	return null
}

/**
 * Order-independent identity for an action, used to recognise our OWN relayed
 * action when it echoes back out of the room's log.
 *
 * It has to be computed identically on both sides of that round trip, and a plain
 * `JSON.stringify` is not: `game_event.action` is jsonb, which does not preserve
 * key order (the server's own duplicate check already canonicalises for exactly
 * this reason). An echo recovered by the reconciliation poll therefore comes back
 * with its keys rearranged, misses the dedupe slot we were holding for it, and
 * gets treated as a remote action — re-applying our own move onto a source tile
 * we already vacated. Sorting the keys removes the dependency on order.
 */
export const actionFingerprint = (action: SerializedAction): string => {
	const value = action as unknown as Record<string, unknown>
	return JSON.stringify(
		Object.keys(value)
			.sort()
			.map((key) => [key, value[key]])
	)
}

export const dispatchSerializedAction = (
	map: MapObject | MapProcesser,
	action: SerializedAction
): void => {
	applyAction(map, action)
}
