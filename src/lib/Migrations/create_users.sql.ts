import type postgres from 'postgres'

export const CreateUsers = (sql: postgres.Sql) =>
	sql`
        create table users (
            id serial primary key,
            auth text unique not null,
            username varchar(20) unique,
            display_name varchar(20) unique,
            profile_image_url text,
            bio text,
            created_at timestamp
        )
        `
