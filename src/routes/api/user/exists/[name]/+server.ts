import { error, json } from '@sveltejs/kit'

export const GET = async ({ params, locals }) => {
	if (!locals.user) error(403, 'You are not logged in');
	const user = await locals.sql`select id from users where username = ${params.name}`
	return json({ exists: user })
}
