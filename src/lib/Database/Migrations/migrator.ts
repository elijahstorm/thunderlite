import { dev } from '$app/environment'
import { CreateDemoData } from '$lib/Migrations/seed_faker_data.sql'
import { consolidatedSchema, dropAllTablesSql } from '$lib/Migrations/list'
import { migrate as applyMigration } from '$lib/dontcode/server'

export const migrate = async () => {
	console.log('starting migrations')
	await applyMigration(consolidatedSchema)
	console.log('finished migrations')

	return { success: true }
}

export const faker = async (user?: string) => {
	if (dev && user) {
		console.log('running demo data migration for user', user)
		await CreateDemoData(user)
	}

	return { success: true }
}

/**
 * Dev only: drop every app-owned table (explicit list — never the platform's
 * `users` table) so `migrate` can rebuild from a clean slate.
 */
export const resetTables = async () => {
	if (!dev) return

	await applyMigration(dropAllTablesSql)
}
