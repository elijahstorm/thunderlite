import { migrationsList } from '$lib/Migrations/list'
import type postgres from 'postgres'

export const migrate = async (sql: postgres.Sql) => {
	await migrationsList(sql)

	return { success: true }
}
