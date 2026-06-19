import { sveltekit } from '@sveltejs/kit/vite'
import { svelteTesting } from '@testing-library/svelte/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	plugins: [sveltekit(), svelteTesting()],
	server: {
		port: 5173,
		host: true,
	},
	preview: {
		port: 4173,
		host: true,
	},
	build: {
		rollupOptions: {
			external: ['iconify-icon'],
		},
	},
	test: {
		include: ['tests/**/*unit.(test|spec).[jt]s'],
		environment: 'jsdom',
	},
})
