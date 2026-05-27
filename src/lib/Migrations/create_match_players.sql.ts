import type postgres from 'postgres'

/**
 * `match_players` — one row per participant in a match (J3). The
 * `(match_id, user_auth)` uniqueness makes per-player writes idempotent: a
 * client that re-POSTs its result cannot create a duplicate row. `outcome` is
 * `'win' | 'loss' | 'draw'` from the engine's authoritative winner.
 */
export const CreateMatchPlayers = (sql: postgres.Sql) =>
	sql`
        create table match_players (
            id serial primary key,
            match_id int references matches(id) on delete cascade,
            user_auth text references users(auth),
            team int,
            outcome text not null,
            unique (match_id, user_auth)
        )
        `
