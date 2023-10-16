import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	plugins: [sveltekit()],
	build: {
		rollupOptions: {
			external: ['iconify-icon'],
		},
	},
	test: {
		include: ['tests/**/*unit.(test|spec).[jt]s'],
		environment: 'jsdom',
		alias: [{ find: /^svelte$/, replacement: 'svelte/internal' }],
	},
})
