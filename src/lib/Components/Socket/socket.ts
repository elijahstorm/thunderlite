import { browser } from '$app/environment'
import { get } from 'svelte/store'
import { interactor } from '$lib/Engine/Interactor/interactor'
import { applyAction } from '$lib/Engine/applyAction'
import { emitOutgoingAction } from '$lib/Engine/outgoingActions'
import {
	dispatchSerializedAction,
	normalizeAction,
} from '$lib/Engine/Interactor/serializedAction'

export const socketOpened = (socket: WebSocket, callback?: VoidFunction) => () => {
	if (browser) {
		import('../Auth/hanko').then((hanko) => {
			const auth = get(hanko.userAuth)
			if (auth) {
				socket.send(`auth:${auth}`)
			}
		})
	}
	if (callback) {
		callback()
	}
}

export const socketClosed = (callback?: VoidFunction) => () => callback && callback()

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
	(_socket: Pick<WebSocket, 'send'>, getMap?: () => MapObject | undefined) =>
	() => {
		const map = getMap?.()
		if (map) applyAction(map, { kind: 'end-turn' })
		emitOutgoingAction({ kind: 'end-turn' })
	}
