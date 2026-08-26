import { dev } from '$app/environment'
import { error } from '@sveltejs/kit'

// Dev-only playground — unreachable in production builds.
export const load = () => {
	if (!dev) throw error(404, 'Not found')
}

// Draws the real sprite sheets to a canvas, so there is nothing to render server side.
export const ssr = false
