import { json, type RequestHandler } from '@sveltejs/kit'

/** Current-user lookup for client-side session state. Never exposes tokens. */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ user: null })
	}

	return json({
		user: {
			id: locals.user,
			email: locals.userEmail ?? null,
		},
	})
}
