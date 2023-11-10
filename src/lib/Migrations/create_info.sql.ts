import type postgres from 'postgres'

export const CreateInfo = (sql: postgres.Sql) =>
	sql`
        create table info (
            id serial primary key,
            info text,
            color text
        )
        `
