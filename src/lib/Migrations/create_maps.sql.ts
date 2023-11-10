import type postgres from 'postgres'

export const CreateMaps = (sql: postgres.Sql) =>
	sql`
        create table maps (
            id serial primary key,
            sha text unique not null,
            url text not null,
            name text not null,
            status text default 'private',
            plays int default 0,
            owner_id int references users(id),
            created_at timestamp default current_timestamp,
            updated_at timestamp default current_timestamp
        )
        `
