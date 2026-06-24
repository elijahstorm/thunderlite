import { dev } from '$app/environment'
import { error } from '@sveltejs/kit'

// Dev-only line-of-sight / height playground — unreachable in production builds.
export const load = () => {
	if (!dev) throw error(404, 'Not found')
}

// The board drives browser-only APIs (canvas, Image, Audio) via GameBoard.
export const ssr = false
