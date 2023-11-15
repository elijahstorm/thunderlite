import type postgres from 'postgres'

export const getMapTypes = async (sql: postgres.Sql) =>
	(await sql`select text from map_types`).map((type) => type.text)
