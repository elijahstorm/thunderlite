import type postgres from 'postgres'

export const CreateFollows = (sql: postgres.Sql) =>
	sql`
        create table follows (
            id serial primary key,
            follower_id int references users(id),
            following_id int references users(id),
            created_at timestamp default current_timestamp
        )
        `
