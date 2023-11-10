import { error } from '@sveltejs/kit'
import { migrate } from '$lib/Database/Migrations/migrator'
import { json } from '@sveltejs/kit'

export const GET = async ({ locals }) => {
	let status

	try {
		status = await migrate(locals.sql)
	} catch (e) {
		console.error(e)
		throw error(500, 'failed to run migrations')
	}

	return json(status)
}
