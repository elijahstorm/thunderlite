import type postgres from 'postgres'

export const CreateUsers = (sql: postgres.Sql) =>
	sql`
        create table users (
            id serial primary key,
            auth text unique not null,
            profile_image_url text,
            username varchar(20) unique,
            display_name varchar(30) unique,
            bio varchar(1000),
            created_at timestamp
        )
        `
