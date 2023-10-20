type SocketMessage = {
	tile: number
}

export const socketOpened = () => console.log('> Opened Socket')
export const socketClosed = () => console.log('< Closed Socket')

export const socketMessage =
	(getMap: () => MapObject | undefined) => (evt: MessageEvent<string>) => {
		const map = getMap()

		if (!map) return

		const { tile } = JSON.parse(evt.data) as SocketMessage

		map.layers.ground[tile] = {
			type: 8,
			state: 0,
		}
	}

export const socketSelect =
	(socket: WebSocket, getMap: () => MapObject) => (x: number, y: number) => {
		const map = getMap()
		socket.send(JSON.stringify({ tile: y * map.cols + x }))
	}
