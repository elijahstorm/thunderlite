import { interactor } from '$lib/Engine/Interactor/interactor'
import { applyAction } from '$lib/Engine/applyAction'
import { emitOutgoingAction } from '$lib/Engine/outgoingActions'
import { dispatchSerializedAction, normalizeAction } from '$lib/Engine/Interactor/serializedAction'

export const socketMessage =
	(getMap: () => MapObject | undefined, render: (now: number) => void) =>
	(evt: MessageEvent<string>) => {
		const map = getMap()
		if (!map) return
		let data: unknown
		try {
			data = JSON.parse(evt.data)
		} catch {
			return
		}
		const action = normalizeAction(data)
		if (action) {
			dispatchSerializedAction(map, action)
			render(performance.now())
		}
	}

export const socketSelect =
	(_socket: Pick<WebSocket, 'send'>, getMap: () => MapObject | undefined) =>
	(x: number, y: number) => {
		const map = getMap()
		if (!map) return
		interactor({ map, tile: y * map.cols + x })
	}

export const socketEndTurn =
	(_socket: Pick<WebSocket, 'send'>, getMap?: () => MapObject | undefined) => () => {
		const map = getMap?.()
		// This is the local player's own end-turn, so it's live like their other
		// committed actions — that credits the turn (and auto-captures) to match stats.
		// Relayed opponent end-turns still arrive silently and don't double-count.
		if (map) applyAction(map, { kind: 'end-turn' }, { live: true })
		emitOutgoingAction({ kind: 'end-turn' })
	}
