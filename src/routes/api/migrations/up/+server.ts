import { error } from '@sveltejs/kit'
import { migrate, resetTables } from '$lib/Database/Migrations/migrator'
import { json } from '@sveltejs/kit'

export const GET = async () => {
	let status

	try {
		await resetTables()
		status = await migrate()
	} catch (e) {
		console.error(e)
		throw error(500, 'failed to run migrations')
	}

	return json(status)
}
