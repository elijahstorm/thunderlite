import { dev } from '$app/environment'
import { error } from '@sveltejs/kit'

// Dev-only playground — unreachable in production builds.
export const load = () => {
	if (!dev) throw error(404, 'Not found')
}

// Everything on the page drives browser-only APIs (Audio, Image, canvas).
export const ssr = false
