/**
 * `game_member` — one row per player in an online (H2) game room. Replaces the
 * `game:{session}` Redis set. `seat` is the join order (creator = 0) and gives
 * a deterministic turn rotation; the `(session, user_session)` primary key makes
 * joins idempotent and lets a new seat be claimed atomically via
 * insert-on-conflict. `user_session` is the server-derived player identity (see
 * `hooks.server.ts`), not a `profiles(auth)` id, so there is no FK here.
 */
export const CreateGameMember = `
create table if not exists game_member (
    session text not null,
    user_session text not null,
    seat int not null,
    primary key (session, user_session)
);
`
