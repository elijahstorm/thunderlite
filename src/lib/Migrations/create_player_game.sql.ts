/**
 * `player_game` — points a player at the online (H2) room they are currently in.
 * Replaces the routing half of the `user-game:{user_session}` Redis hash (the
 * `sha` now lives on `game_room`). One row per `user_session`, upserted on
 * create/join so the latest room wins, mirroring the old hash overwrite.
 * `expires_at` is a millisecond epoch for lazy TTL — a stale pointer reads as
 * absent. `user_session` is the server-derived player identity, not a
 * `profiles(auth)` id, so there is no FK here.
 */
export const CreatePlayerGame = `
create table if not exists player_game (
    user_session text primary key,
    session text not null,
    expires_at bigint not null
);
`
