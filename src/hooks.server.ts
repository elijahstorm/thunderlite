import { redirect, type Handle } from '@sveltejs/kit'
import { authenticatedUser } from '$lib/Components/Auth/hanko-auth'

export const handle: Handle = async ({ event, resolve }) => {
	const verified = await authenticatedUser(event)
	const protectedRoutes = ['/me']

	if (!verified && protectedRoutes.some(event.url.pathname.startsWith)) {
		throw redirect(303, '/login')
	}

	return await resolve(event)
}
