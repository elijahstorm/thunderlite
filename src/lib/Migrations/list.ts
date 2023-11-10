import type postgres from 'postgres'
import { CreateUserTable } from './create_users.sql'

export const migrationsList = async (types: postgres.Sql) => {
	const results = []
	const migrations = migrationsInOrder

	console.log('starting migrations')

	for (const migration of migrations) {
		const result = await migration(types)
		results.push(result)
	}

	console.log('finished migrations')

	return results
}

const migrationsInOrder = [CreateUserTable] as const
