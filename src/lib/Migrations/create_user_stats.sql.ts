import type postgres from 'postgres'

export const CreateUserStats = (sql: postgres.Sql) =>
	sql`
        create table user_stats (
            id serial primary key,
            user_auth text references users(auth) unique,
            elo int,
            games_played int default 0,
            games_won int default 0,
            games_lost int default 0
        )
        `
