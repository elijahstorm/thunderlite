import { POSTGRES_URL, VERCEL_ENV } from '$env/static/private'
import { createPool, sql } from '@vercel/postgres'
import { migrationsList } from '$lib/Migrations/list'

export const migrate = async () =>
	VERCEL_ENV === 'development' ? localMigrations() : prodMigrations()

const prodMigrations = async () => {
	const prod = createPool({ connectionString: POSTGRES_URL })

	await migrationsList({ prod })

	return { success: true }
}

const localMigrations = async () => {
	// const local = postgres(LOCAL_POSTGRES, { max: 1 })
	const local = sql

	await migrationsList({ local })

	return { success: true }
}
