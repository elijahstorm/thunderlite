import type postgres from 'postgres'

export const CreateFollows = (sql: postgres.Sql) =>
	sql`
        create table follows (
            id serial primary key,
            source text references users(auth),
            target text references users(auth),
            created_at timestamp default current_timestamp
        )
        `
