import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import vercel from '@sveltejs/adapter-vercel'

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: vercel({
			runtime: 'nodejs24.x'
		})
	}
}

export default config
