import { WebSocketServer } from 'ws'

const port = Number(process.env.CHAT_PORT ?? 8083)
const wss = new WebSocketServer({ port, path: '/ws' })

const clients = new Map()

const broadcast = (sender, payload) => {
	for (const [client] of clients) {
		if (client === sender) continue
		if (client.readyState !== client.OPEN) continue
		client.send(payload)
	}
}

wss.on('connection', (socket) => {
	clients.set(socket, { auth: null })

	socket.on('message', (raw) => {
		const text = raw.toString()

		if (text.startsWith('auth:')) {
			clients.get(socket).auth = text.slice(5)
			return
		}

		try {
			JSON.parse(text)
		} catch {
			return
		}

		broadcast(socket, text)
	})

	socket.on('close', () => clients.delete(socket))
	socket.on('error', () => clients.delete(socket))
})

console.log(`[chat-server] listening on ws://0.0.0.0:${port}/ws`)
