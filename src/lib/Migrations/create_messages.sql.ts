import type postgres from 'postgres'

export const CreateMessages = (sql: postgres.Sql) =>
	sql`
        create table messages (
            id serial primary key,
            sender_id int references users(id),
            reciever_id int references users(id),
            message_text text,
            created_at timestamp default current_timestamp
        )
        `
