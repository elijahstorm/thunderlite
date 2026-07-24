/**
 * Verify the DontCode KV cache end-to-end against the gateway your env points
 * at. Exercises every primitive the app uses (get/set/ttl/nx/del, hashes,
 * sets) with throwaway keys, reports each step, and exits non-zero on the
 * first failure.
 *
 *   pnpm kv:check                            # against .env.local
 *   pnpm kv:check .env.production.local      # against prod creds
 *   pnpm kv:check -- --seed-site             # also write the site:config entry
 *
 * NOTE: KV is served by the hosted gateway only — against the local mock
 * (`pnpm mock`) every read is a miss and this check fails by design.
 */
import { isDontCodeError } from 'dontcode'
import { loadEnv, makeClient } from './_dontcode'

const args = process.argv.slice(2)
const seedSite = args.includes('--seed-site')
const envArg = args.find((a) => !a.startsWith('--'))

loadEnv(envArg)
const { client, host, keyHint } = makeClient()
const kv = client.cache

// Keep in sync with DEFAULT_CONFIG in src/routes/+layout.server.ts — seeding
// makes the KV entry explicit so it can be edited without a deploy.
const SITE_CONFIG = {
	title: 'ThunderLite',
	desc: 'A free browser rebuild of Battalion: Arena. Turn-based tactics with an adaptive CPU, weather, maps up to 500x500, a scriptable map editor, and live multiplayer.',
	googleFonts: '',
}

console.log(`KV check against ${host} (key ${keyHint}) …`)

let failures = 0
const step = async (name: string, run: () => Promise<boolean>) => {
	try {
		const ok = await run()
		console.log(`${ok ? '✓' : '✗'} ${name}`)
		if (!ok) failures++
	} catch (err) {
		failures++
		if (isDontCodeError(err)) {
			console.error(`✗ ${name} — gateway error ${err.status}:`, err.body?.error ?? err.message)
		} else {
			console.error(`✗ ${name} —`, err)
		}
	}
}

// Unique-per-run prefix so parallel runs (or leftovers from a crashed one)
// can't collide; every key gets a TTL as a belt-and-braces cleanup.
const prefix = `kv-check:${Date.now().toString(36)}`
const TTL = 60

await step('set / get round-trips a JSON value', async () => {
	await kv.set(`${prefix}:value`, { hello: 'thunderlite', n: 42 }, { ttl: TTL })
	const back = await kv.get<{ hello: string; n: number }>(`${prefix}:value`)
	return back?.hello === 'thunderlite' && back?.n === 42
})

await step('get on a missing key is null (not an error)', async () => {
	return (await kv.get(`${prefix}:never-written`)) === null
})

await step('nx refuses to overwrite an existing key', async () => {
	const first = await kv.set(`${prefix}:lock`, '1', { ttl: TTL, nx: true })
	const second = await kv.set(`${prefix}:lock`, '2', { ttl: TTL, nx: true })
	return first === true && second === false
})

await step('del removes and reports existence', async () => {
	await kv.set(`${prefix}:gone`, 'x', { ttl: TTL })
	const existed = await kv.del(`${prefix}:gone`)
	return existed === true && (await kv.get(`${prefix}:gone`)) === null
})

await step('expire updates the TTL on a live key', async () => {
	await kv.set(`${prefix}:ttl`, 'x', { ttl: TTL })
	return (await kv.expire(`${prefix}:ttl`, 5)) === true
})

await step('hset / hgetAll round-trips fields', async () => {
	await kv.hset(`${prefix}:hash`, { name: 'Zed', level: 7 })
	await kv.expire(`${prefix}:hash`, TTL)
	const back = await kv.hgetAll<{ name: string; level: number }>(`${prefix}:hash`)
	return back?.name === 'Zed' && Number(back?.level) === 7
})

await step('sAdd / sMembers / sRem manage a string set', async () => {
	await kv.sAdd(`${prefix}:set`, 'a', 'b')
	await kv.expire(`${prefix}:set`, TTL)
	const members = await kv.sMembers(`${prefix}:set`)
	await kv.sRem(`${prefix}:set`, 'a')
	const after = await kv.sMembers(`${prefix}:set`)
	return members.sort().join(',') === 'a,b' && after.join(',') === 'b'
})

if (seedSite) {
	await step(`seed site:config (${SITE_CONFIG.title})`, async () => {
		await kv.set('site:config', SITE_CONFIG)
		const back = await kv.get<typeof SITE_CONFIG>('site:config')
		return back?.title === SITE_CONFIG.title
	})
}

if (failures > 0) {
	console.error(`\n${failures} step(s) failed. If this is the local mock gateway, that is`)
	console.error('expected — KV lives on the hosted gateway only (see .env.example).')
	process.exit(1)
}
console.log('\nAll KV checks passed.')
