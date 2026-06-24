import { applyAction } from '../applyAction'

export type SerializedAction =
	| { kind: 'move'; from: number; to: number }
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
	| { kind: 'end-turn' }
	| { kind: 'surrender'; team: number }

export type GameEvent = {
	id: number
	userSession: string
	action: SerializedAction
	ts: number
}

const isTile = (v: unknown): v is number =>
	typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isInteger(v)

export const isValidSerializedAction = (value: unknown): value is SerializedAction => {
	if (!value || typeof value !== 'object') return false
	const v = value as Record<string, unknown>
	switch (v.kind) {
		case 'move':
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
			return true
		case 'surrender':
			return isTile(v.team)
	}
	return false
}

export const normalizeAction = (raw: unknown): SerializedAction | null => {
	if (isValidSerializedAction(raw)) return raw
	return null
}

export const dispatchSerializedAction = (
	map: MapObject | MapProcesser,
	action: SerializedAction
): void => {
	applyAction(map, action)
}
