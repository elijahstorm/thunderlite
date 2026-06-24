import { error } from '@sveltejs/kit'
import type { LayoutServerLoad } from './$types'
import { EDGE_CONFIG } from '$env/static/private'
import { createClient } from '@vercel/edge-config'

export const load: LayoutServerLoad = async ({ locals }) => {
	const edgeConfig = createClient(EDGE_CONFIG)
	const config = (await edgeConfig.get('public')) as {
		title: string
		desc: string
		googleFonts: string
	}

	if (!config) {
		throw error(404, 'Edge config not pulled')
	}

	// Hand the already-resolved session to the client so it can render the
	// signed-in state on first paint instead of round-tripping /api/auth/me.
	const user = locals.user ? { id: locals.user, email: locals.userEmail ?? null } : null

	return { config, user }
}
