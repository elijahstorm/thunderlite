import type postgres from 'postgres'

export const CreateLogs = (sql: postgres.Sql) =>
	sql`
        create table logs (
            id serial primary key,
            type text,
            message text,
            time timestamp default current_timestamp
        )
        `
