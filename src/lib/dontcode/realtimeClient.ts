/**
 * Browser-side DontCode realtime client.
 *
 * The official client for this protocol ships as `@dontcode/realtime/client`,
 * but that package hard-depends on next+react, so we vendor the (small,
 * framework-agnostic) connection logic here instead. Wire protocol, verified
 * against the platform's realtime service source:
 *
 *   1. POST the local token endpoint (`/api/realtime`) with
 *      `{ operation: 'token', channels }` → `{ token, url }`. The project API
 *      key never reaches the browser; the token is short-lived and scoped to
 *      exactly those channels.
 *   2. Open a WebSocket to `${url}?token=${token}` (wss on the hosted
 *      gateway). The token's channels are granted on connect.
 *   3. Frames are JSON. Incoming: `{ type: 'message', channel, payload }`.
 *      Outgoing publish: `{ type: 'publish', channel, payload }`.
 *
 * Reconnects with exponential backoff after a drop, minting a fresh token each
 * attempt (they expire). If the very first `open()` fails — e.g. the local
 * mock gateway, which has no realtime — it rejects and does NOT retry: the
 * caller decides whether to fall back (GameSocket keeps HTTP polling).
 */

export interface RealtimeMessage<T = unknown> {
	channel: string
	payload: T
}

export type MessageHandler<T = unknown> = (message: RealtimeMessage<T>) => void

export interface ConnectOptions {
	/** Channels to subscribe to (granted in the minted token). */
	channels: string[]
	/** Local route that mints the connection token (default '/api/realtime'). */
	endpoint?: string
	/** Observes connection state — drives fallbacks and offline indicators. */
	onStatus?: (connected: boolean) => void
}

interface TokenResponse {
	token: string
	url: string
}

export class RealtimeConnection {
	private ws: WebSocket | null = null
	private handlers = new Map<string, Set<MessageHandler>>()
	private closed = false
	private backoff = 500
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null
	private readonly options: Required<Pick<ConnectOptions, 'channels' | 'endpoint'>> &
		Pick<ConnectOptions, 'onStatus'>

	constructor(options: ConnectOptions) {
		this.options = {
			channels: options.channels,
			endpoint: options.endpoint ?? '/api/realtime',
			onStatus: options.onStatus,
		}
	}

	private async mint(): Promise<TokenResponse> {
		const res = await fetch(this.options.endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ operation: 'token', channels: this.options.channels }),
		})
		if (!res.ok) {
			const err = (await res.json().catch(() => null)) as { error?: string } | null
			throw new Error(err?.error ?? `Failed to mint realtime token: ${res.statusText}`)
		}
		return res.json() as Promise<TokenResponse>
	}

	/** Open the connection. Resolves once the socket is established. */
	async open(): Promise<void> {
		const { token, url } = await this.mint()
		if (this.closed) return
		await new Promise<void>((resolve, reject) => {
			const ws = new WebSocket(`${url}?token=${encodeURIComponent(token)}`)
			this.ws = ws
			ws.onopen = () => {
				this.backoff = 500
				this.options.onStatus?.(true)
				resolve()
			}
			ws.onmessage = (ev) => this.dispatch(ev.data)
			ws.onerror = () => reject(new Error('Realtime connection error'))
			ws.onclose = () => {
				this.options.onStatus?.(false)
				if (!this.closed) this.reconnect()
			}
		})
	}

	private dispatch(raw: unknown): void {
		let frame: { type?: string; channel?: string; payload?: unknown }
		try {
			frame = JSON.parse(String(raw))
		} catch {
			return
		}
		if (frame.type !== 'message' || !frame.channel) return
		const subs = this.handlers.get(frame.channel)
		if (!subs) return
		for (const cb of subs) cb({ channel: frame.channel, payload: frame.payload })
	}

	private reconnect(): void {
		const delay = Math.min(this.backoff, 10_000)
		this.backoff *= 2
		this.reconnectTimer = setTimeout(() => {
			if (this.closed) return
			this.open().catch(() => this.reconnect())
		}, delay)
	}

	/** Register a handler for a channel. Returns an unsubscribe function. */
	subscribe<T = unknown>(channel: string, handler: MessageHandler<T>): () => void {
		let subs = this.handlers.get(channel)
		if (!subs) {
			subs = new Set()
			this.handlers.set(channel, subs)
		}
		subs.add(handler as MessageHandler)
		return () => {
			this.handlers.get(channel)?.delete(handler as MessageHandler)
		}
	}

	/** Publish to a channel the connection token grants. */
	publish(channel: string, payload: unknown): void {
		this.ws?.send(JSON.stringify({ type: 'publish', channel, payload }))
	}

	get connected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN
	}

	close(): void {
		this.closed = true
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
		this.ws?.close()
		this.ws = null
	}
}
