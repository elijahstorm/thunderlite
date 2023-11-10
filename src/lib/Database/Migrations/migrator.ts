import { POSTGRES_URL } from '$env/static/private'
import { migrationsList } from '$lib/Migrations/list'
import postgres from 'postgres'

export const migrate = async () => {
	await migrationsList(postgres(POSTGRES_URL, { max: 1 }))

	return { success: true }
}
