/**
 * `game_event` — the append-only action log for an online (H2) game room.
 * Replaces the `game-events:{session}` Redis list. `seq` is the 0-based index
 * within a room (the old list position, and the `GameEvent.id` clients poll on);
 * the `(session, seq)` primary key makes appends atomic — a writer computes the
 * next `seq` from the row count and inserts-on-conflict, retrying if it lost a
 * race. `action` is the serialized engine action (see `serializedAction.ts`).
 */
export const CreateGameEvent = `
create table if not exists game_event (
    session text not null,
    seq int not null,
    user_session text not null,
    action jsonb not null,
    ts bigint not null,
    primary key (session, seq)
);
`
