import { CreateUserTable } from './create_users.sql'
import type { VercelPool, sql } from '@vercel/postgres'

export type MigratorTypes = { local?: typeof sql; prod?: VercelPool }

export const migrationsList = async (types: MigratorTypes) => {
	const results = []
	const migrations = migrationsInOrder

	console.log('starting')
	console.log(types)

	for (const migration of migrations) {
		const result = await migration(types)
		results.push(result)
	}

	return results
}

const migrationsInOrder = [CreateUserTable] as const
