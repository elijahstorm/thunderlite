import type postgres from 'postgres'

export const CreateMessages = (sql: postgres.Sql) =>
	sql`
        create table messages (
            id serial primary key,
            source text references users(auth),
            target text references users(auth),
            message text not null,
            created_at timestamp default current_timestamp
        )
        `
