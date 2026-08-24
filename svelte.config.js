import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import vercel from '@sveltejs/adapter-vercel'

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: vercel({
			runtime: 'nodejs24.x',
		}),
		version: {
			// Poll `_app/version.json` so a tab that has been open across a deploy can
			// KNOW it is stale. Online play is why this earns its request: a client
			// running yesterday's bundle speaks yesterday's sync protocol, and match 13
			// is what that costs — a stale tab relayed unordered moves and left both
			// players on boards that could never be reconciled. The server refuses
			// those relays now; this is how the player finds out in time to reload
			// instead of playing a turn into the void. See `GameSocket`.
			pollInterval: 60_000,
		},
	},
}

export default config
