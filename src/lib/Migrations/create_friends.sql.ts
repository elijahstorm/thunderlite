import type postgres from 'postgres'

export const CreateFriends = (sql: postgres.Sql) =>
	sql`
        create table friends (
            id serial primary key,
            user_id1 int references users(id),
            user_id2 int references users(id),
            status varchar(20) default 'pending',
            created_at timestamp default current_timestamp
        )
        `
