import { error } from '@sveltejs/kit'

export const prerender = false
export const ssr = false

export async function load({ locals }) {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')

	return {
		userSession,
	}
}
