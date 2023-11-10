import { migrationsList } from '$lib/Migrations/list'
import type postgres from 'postgres'

export const migrate = async (sql: postgres.Sql) => {
	await migrationsList(sql)

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
