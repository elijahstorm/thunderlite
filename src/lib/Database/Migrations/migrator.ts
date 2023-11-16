import { VERCEL_ENV } from '$env/static/private'
import { CreateDemoData } from '$lib/Migrations/create_demo_data.sql'
import { migrationsList } from '$lib/Migrations/list'
import type postgres from 'postgres'

export const migrate = async (sql: postgres.Sql) => {
	await migrationsList(sql)

	return { success: true }
}

export const faker = async (sql: postgres.Sql, user?: string) => {
	if (VERCEL_ENV === 'development' && user) {
		console.log('running demo data migration for user', user)
		await CreateDemoData(sql, user)
	}

	return { success: true }
}

export const resetTables = async (sql: postgres.Sql) =>
	await sql`
		DO $$ 
		BEGIN
			EXECUTE 'DROP TABLE IF EXISTS ' || string_agg(table_name, ', ') || ' CASCADE'
			FROM information_schema.tables
			WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
		END $$;
		`
