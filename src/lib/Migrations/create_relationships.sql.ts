import type postgres from 'postgres'

export const CreateRelationships = (sql: postgres.Sql) =>
	sql`
        create table relationships (
            id serial primary key,
            source text references users(auth),
            target text references users(auth),
            status varchar(20) default 'unknown',
            created_at timestamp default current_timestamp
        )
        `
