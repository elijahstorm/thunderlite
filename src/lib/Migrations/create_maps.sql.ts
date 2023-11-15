import type postgres from 'postgres'

export const CreateMaps = (sql: postgres.Sql) =>
	sql`
        create table maps (
            id serial primary key,
            sha text unique not null,
            owner_auth text references users(auth),
            name text not null,
            description text not null,
            map_type_id int references map_types(id),
            thumbnail text not null,
            url text not null,
            status text not null default 'private',
            plays int not null default 0,
            created_at timestamp default current_timestamp,
            updated_at timestamp default current_timestamp
        )
        `
