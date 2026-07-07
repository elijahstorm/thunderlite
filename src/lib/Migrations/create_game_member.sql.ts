/**
 * `game_member` — one row per player in an online (H2) game room. Replaces the
 * `game:{session}` Redis set. `seat` is the join order (creator = 0) and gives
 * a deterministic turn rotation; the `(session, user_session)` primary key makes
 * joins idempotent and lets a new seat be claimed atomically via
 * insert-on-conflict. `user_session` is the server-derived player identity (see
 * `hooks.server.ts`), not a `profiles(auth)` id, so there is no FK here.
 *
 * `user_auth` is the joiner's public `profiles(auth)` id, recorded at join time.
 * `user_session` is a one-way HMAC of the auth id (see `getUserSession`), so it
 * can't be reversed to look up a profile — storing the auth alongside it is what
 * lets the in-game player list resolve each seat to a real username + avatar
 * instead of "Player N". Nullable: rows created before this column existed, and
 * any seat whose profile can't be resolved, simply fall back to the generic
 * label. The `alter` keeps already-migrated rooms working (idempotent, safe to
 * re-run alongside the create).
 */
export const CreateGameMember = `
create table if not exists game_member (
    session text not null,
    user_session text not null,
    user_auth text,
    seat int not null,
    primary key (session, user_session)
);

alter table game_member add column if not exists user_auth text;
`
