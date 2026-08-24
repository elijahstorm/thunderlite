/**
 * `game_log` — per-client diagnostic trace for an online game room.
 *
 * Distinct from `game_event`, which is the authoritative, shared action log the
 * whole match is replayed from. This table is the *observational* record: what
 * each individual client sent, received, and computed. Online play has no
 * server-side simulation, so when two clients' boards diverge the shared event
 * log looks perfectly fine — the difference lives entirely in how each client
 * processed it. Without this, a desync report is unfalsifiable.
 *
 *   kind = 'out'    an action this client relayed (plus the server's answer)
 *   kind = 'in'     an event it received: transport (`push`/`poll`) + disposition
 *   kind = 'state'  a board digest anchored to `event_id` — comparing the same
 *                   `event_id` across two `user_session`s locates a divergence
 *   kind = 'chat'   an in-game chat line (realtime-only; unrecorded elsewhere)
 *   kind = 'desync' an action the engine could not apply, with its board snapshot
 *   kind = 'note'   breadcrumbs (connect/disconnect, resync prompts, teardown)
 *
 * `event_id` is the `game_event.seq` the entry is anchored to, or -1 when it has
 * no anchor. `detail` carries the kind-specific payload. Rows are diagnostic
 * only — nothing in gameplay reads them, and losing the table costs no state.
 */
export const CreateGameLog = `
create table if not exists game_log (
    id serial primary key,
    session text not null,
    user_session text not null,
    kind varchar(16) not null,
    event_id int not null default -1,
    detail jsonb not null,
    ts bigint not null,
    created_at timestamp default current_timestamp
);

create index if not exists game_log_session_idx on game_log (session, id);

create index if not exists game_log_created_idx on game_log (created_at);
`
