import { error, json } from '@sveltejs/kit'
import { db } from '$lib/dontcode/server'

export const GET = async ({ params, locals }) => {
	if (!locals.user) throw error(403, 'You are not logged in')
	const user = await db.find('profiles', { where: { username: params.name }, select: ['id'] })
	return json({ exists: user })
}
