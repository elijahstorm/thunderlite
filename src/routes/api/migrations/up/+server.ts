import { error } from '@sveltejs/kit'
import { migrate, resetTables } from '$lib/Database/Migrations/migrator'
import { json } from '@sveltejs/kit'

export const GET = async ({ locals }) => {
	let status

	try {
		await resetTables(locals.sql)
		status = await migrate(locals.sql)
	} catch (e) {
		console.error(e)
		error(500, 'failed to run migrations');
	}

	return json(status)
}
