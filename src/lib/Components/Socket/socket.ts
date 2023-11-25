import { browser } from '$app/environment'
import { interactor } from '$lib/Engine/Interactor/interactor'
import { get } from 'svelte/store'

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
		interactor({ ...JSON.parse(evt.data), map })
		render(performance.now())
	}

export const socketSelect =
	(socket: WebSocket, getMap: () => MapObject) => (x: number, y: number) => {
		const map = getMap()
		socket.send(JSON.stringify({ tile: y * map.cols + x }))
	}
