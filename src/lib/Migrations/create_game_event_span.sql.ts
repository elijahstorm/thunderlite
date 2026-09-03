/**
 * `game_event` rows that hold a whole run of actions, not one.
 *
 * The log was one row per action: 622 inserts for match 24, against a project
 * write budget of 300 a minute shared by every room. A client now holds its turn
 * and relays it whole at the handover, and the server stores that run as ONE
 * row. `seq` stays the id of the run's FIRST action and `span` says how many
 * follow it, so ids remain contiguous across the log and every reader still sees
 * a flat list of single-action events: `toEvents` expands a row on the way out.
 *
 *   actions      the run, in order; NULL on legacy rows (whose `action` column
 *                is the whole story). `action` is kept as the run's first action
 *                so nothing that reads it breaks and the NOT NULL holds.
 *   span         actions in the run; 1 on legacy rows. The next run's `seq` is
 *                the last row's `seq + span`.
 *   client_span  the sender's ordinals the run consumed; 1 on legacy rows. The
 *                sender's next ordinal is its last row's `client_seq + client_span`.
 *
 * Idempotent alters, no backfill: the defaults make every existing row a run of
 * one, which is exactly what it was.
 */
export const CreateGameEventSpan = `
alter table game_event add column if not exists actions jsonb;
alter table game_event add column if not exists span int not null default 1;
alter table game_event add column if not exists client_span int not null default 1;
`
