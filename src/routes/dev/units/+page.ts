import { dev } from '$app/environment'
import { error } from '@sveltejs/kit'

// Dev-only unit / FX viewer — unreachable in production builds.
export const load = () => {
	if (!dev) throw error(404, 'Not found')
}

// Everything on the page drives browser-only APIs (Image, canvas, Audio).
export const ssr = false
