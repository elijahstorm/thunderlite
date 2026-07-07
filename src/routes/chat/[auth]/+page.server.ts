import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

/**
 * Full-screen private conversation. `/chat` is a protected route (see
 * hooks.server.ts), so an unauthenticated visitor is bounced to /login before
 * this runs; the guard here is a belt-and-braces fallback.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Not logged in')
	return { me: locals.user, target: params.auth }
}
