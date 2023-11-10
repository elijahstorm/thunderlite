import type postgres from 'postgres'

export const CreateUserTable = (sql: postgres.Sql) =>
	sql`
        create table users (
            id serial primary key,
            auth text unique not null,
            username text,
            display_name text unique,
            profile_image_url text,
            bio text,
            created_at timestamp
        )
        `
