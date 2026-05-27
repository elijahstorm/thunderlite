import type postgres from 'postgres'

/**
 * `matches` — one row per completed match (J3). `session_id` is the online
 * (H2) game session and is `unique` so re-POSTing the same result is a no-op;
 * it is nullable because hot-seat / campaign matches have no shared session
 * (Postgres treats multiple NULLs as distinct, so those rows never collide).
 * `winner_team` is the winning team index, or NULL for a draw.
 */
export const CreateMatches = (sql: postgres.Sql) =>
	sql`
        create table matches (
            id serial primary key,
            session_id text unique,
            map_sha text,
            mode text not null,
            winner_team int,
            turns int not null default 0,
            started_at timestamp,
            ended_at timestamp default current_timestamp
        )
        `
