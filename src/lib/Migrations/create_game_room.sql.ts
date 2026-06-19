/**
 * `game_room` — one row per online (H2) multiplayer room, keyed by the random
 * `session` code that players share to join. Replaces the old `user-game:*`
 * hash fields (`sha`) and the `game-current:*` turn pointer that lived in KV.
 *
 * `current_turn` holds the `user_session` whose move is allowed next; it is
 * seeded to the room creator at creation, so it is only NULL transiently for
 * legacy rows. `expires_at` is a millisecond epoch used for lazy TTL: reads
 * treat a room past its expiry as absent (KV used a 24h `ex` here).
 */
export const CreateGameRoom = `
create table if not exists game_room (
    session text primary key,
    sha text not null,
    current_turn text,
    expires_at bigint not null
);
`
