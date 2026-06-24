import { dev } from '$app/environment'
import { error } from '@sveltejs/kit'

// Dev-only audio board — unreachable in production builds.
export const load = () => {
	if (!dev) throw error(404, 'Not found')
}

// The mixer drives the browser-only Web Audio engine.
export const ssr = false
