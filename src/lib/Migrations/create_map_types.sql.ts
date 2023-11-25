import type postgres from 'postgres'

export const CreateMapTypes = (sql: postgres.Sql) =>
	sql`
        create table map_types (
            id serial primary key,
            text varchar(50)
        )
        `
