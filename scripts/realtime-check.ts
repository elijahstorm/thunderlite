/**
 * Verify DontCode realtime end-to-end against the gateway your env points at,
 * exercising the exact paths multiplayer uses:
 *
 *   1. mint a channel-scoped connection token   (what /api/realtime does)
 *   2. open the WebSocket with it               (what realtimeClient.ts does)
 *   3. publish from the server SDK              (what the move endpoint does)
 *      → assert the socket receives the frame
 *   4. publish from a second socket             (what chat does)
 *      → assert the first socket receives it
 *   5. read channel presence
 *
 *   pnpm realtime:check                          # against .env.local
 *   pnpm realtime:check .env.production.local    # against prod creds
 *
 * NOTE: realtime is served by the hosted gateway only — against the local
 * mock (`pnpm mock`) the token mint fails and this check fails by design.
 * Uses Node's built-in WebSocket (Node 22+), no extra deps.
 */
import { isDontCodeError } from 'dontcode'
import { loadEnv, makeClient } from './_dontcode'

const args = process.argv.slice(2)
loadEnv(args.find((a) => !a.startsWith('--')))
const { client, host, keyHint } = makeClient()

const CHANNEL = `realtime-check:${Date.now().toString(36)}`
const WAIT_MS = 5000

const fail = (msg: string, err?: unknown): never => {
	if (err && isDontCodeError(err)) {
		console.error(`✗ ${msg} — gateway error ${err.status}:`, err.body?.error ?? err.message)
	} else if (err) {
		console.error(`✗ ${msg} —`, err)
	} else {
		console.error(`✗ ${msg}`)
	}
	process.exit(1)
}

interface Frame {
	type?: string
	channel?: string
	payload?: unknown
}

/** Open a socket with a fresh token and collect message frames for CHANNEL. */
const connect = async (identity: string) => {
	const { token, url } = await client.realtime.mintToken({
		channels: [CHANNEL],
		identity,
		ttl: 300,
	})
	const ws = new WebSocket(`${url}?token=${encodeURIComponent(token)}`)
	const frames: Frame[] = []
	const waiters: ((frame: Frame) => void)[] = []
	ws.onmessage = (ev) => {
		let frame: Frame
		try {
			frame = JSON.parse(String(ev.data))
		} catch {
			return
		}
		if (frame.type !== 'message' || frame.channel !== CHANNEL) return
		frames.push(frame)
		waiters.splice(0).forEach((w) => w(frame))
	}
	await new Promise<void>((resolve, reject) => {
		ws.onopen = () => resolve()
		ws.onerror = () => reject(new Error(`WebSocket to ${url} failed`))
		setTimeout(() => reject(new Error('WebSocket open timed out')), WAIT_MS)
	})
	const nextFrame = (predicate: (frame: Frame) => boolean): Promise<Frame> =>
		new Promise((resolve, reject) => {
			const hit = frames.find(predicate)
			if (hit) return resolve(hit)
			const timer = setTimeout(
				() => reject(new Error(`No matching frame within ${WAIT_MS}ms`)),
				WAIT_MS
			)
			waiters.push((frame) => {
				if (!predicate(frame)) return
				clearTimeout(timer)
				resolve(frame)
			})
		})
	return { ws, nextFrame }
}

console.log(`Realtime check against ${host} (key ${keyHint}), channel ${CHANNEL} …`)

let subscriber: Awaited<ReturnType<typeof connect>>
try {
	subscriber = await connect('checker-a')
	console.log('✓ minted token and opened WebSocket')
} catch (err) {
	fail('mint token / open WebSocket (expected against the local mock gateway)', err)
	process.exit(1) // unreachable; narrows `subscriber` for TS
}

try {
	const delivered = await client.realtime.publish(CHANNEL, { via: 'server' })
	const frame = await subscriber.nextFrame((f) => (f.payload as { via?: string })?.via === 'server')
	console.log(
		`✓ server publish delivered to ${delivered} subscriber(s); frame received:`,
		JSON.stringify(frame.payload)
	)
} catch (err) {
	fail('server publish → socket delivery', err)
}

try {
	const publisher = await connect('checker-b')
	publisher.ws.send(
		JSON.stringify({ type: 'publish', channel: CHANNEL, payload: { via: 'socket' } })
	)
	const frame = await subscriber.nextFrame((f) => (f.payload as { via?: string })?.via === 'socket')
	console.log('✓ client publish delivered between sockets:', JSON.stringify(frame.payload))
	publisher.ws.close()
} catch (err) {
	fail('client publish → socket delivery', err)
}

try {
	const members = await client.realtime.presence(CHANNEL)
	const identities = members.map((m) => m.identity ?? m.id)
	console.log(`✓ presence reports ${members.length} member(s):`, identities.join(', '))
} catch (err) {
	fail('presence read', err)
}

subscriber.ws.close()
console.log('\nAll realtime checks passed.')
process.exit(0)
