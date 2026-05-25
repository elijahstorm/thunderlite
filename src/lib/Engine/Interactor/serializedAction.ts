import { endTurn } from '../turnLoop'
import { interactor } from './interactor'

export type SerializedAction =
	| { kind: 'tile'; tile: number }
	| { kind: 'endTurn' }

export type GameEvent = {
	id: number
	userSession: string
	action: SerializedAction
	ts: number
}

export const isValidSerializedAction = (value: unknown): value is SerializedAction => {
	if (!value || typeof value !== 'object') return false
	const v = value as Record<string, unknown>
	if (v.kind === 'tile') {
		return typeof v.tile === 'number' && Number.isFinite(v.tile) && v.tile >= 0
	}
	if (v.kind === 'endTurn') return true
	return false
}

export const normalizeAction = (raw: unknown): SerializedAction | null => {
	if (isValidSerializedAction(raw)) return raw
	if (raw && typeof raw === 'object') {
		const r = raw as Record<string, unknown>
		if (typeof r.tile === 'number' && Number.isFinite(r.tile) && r.tile >= 0) {
			return { kind: 'tile', tile: r.tile }
		}
	}
	return null
}

export const dispatchSerializedAction = (map: MapObject, action: SerializedAction): void => {
	switch (action.kind) {
		case 'tile':
			interactor({ map, tile: action.tile })
			return
		case 'endTurn':
			endTurn({ map })
			return
	}
}
