import { error, json } from '@sveltejs/kit'
import { db } from '$lib/dontcode/server'

export const GET = async ({ params, locals }) => {
	if (!locals.user) throw error(403, 'You are not logged in')
	// The caller's own name is not "taken" from their point of view — without
	// excluding their own row, re-saving the profile form without changing the
	// username reports a conflict against themselves.
	const user = await db.find('profiles', {
		where: { username: params.name, auth: { not: locals.user } },
		select: ['id'],
	})
	return json({ exists: user })
}
