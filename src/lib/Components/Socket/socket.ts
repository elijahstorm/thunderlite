import { interactor } from '$lib/Engine/Interactor/interactor'

export const socketOpened = (callback?: VoidFunction) => () => callback && callback()

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
