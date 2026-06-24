import { dev } from '$app/environment'
import { error } from '@sveltejs/kit'

// Dev-only movement / pathing playground — unreachable in production builds.
export const load = () => {
	if (!dev) throw error(404, 'Not found')
}

export const ssr = false
