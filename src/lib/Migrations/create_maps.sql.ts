import type postgres from 'postgres'

export const CreateMaps = (sql: postgres.Sql) =>
	sql`
        create table maps (
            id serial primary key,
            sha text unique not null,
            owner_auth text references users(auth),
            name text not null,
            description text not null,
            thumbnail text not null,
            url text not null,
            status text default 'private',
            plays int default 0,
            created_at timestamp default current_timestamp,
            updated_at timestamp default current_timestamp
        )
        `
