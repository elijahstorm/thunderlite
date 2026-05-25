import { browser } from '$app/environment'
import { get } from 'svelte/store'
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
	(socket: Pick<WebSocket, 'send'>, getMap: () => MapObject) =>
	(x: number, y: number) => {
		const map = getMap()
		socket.send(JSON.stringify({ kind: 'tile', tile: y * map.cols + x }))
	}

export const socketEndTurn = (socket: Pick<WebSocket, 'send'>) => () => {
	socket.send(JSON.stringify({ kind: 'endTurn' }))
}
