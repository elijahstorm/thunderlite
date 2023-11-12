import type postgres from 'postgres'

export const CreateLikes = (sql: postgres.Sql) =>
	sql`
        create table likes (
            id serial primary key,
            user_auth text references users(auth),
            map_id int references maps(id),
            created_at timestamp default current_timestamp
        )
        `
