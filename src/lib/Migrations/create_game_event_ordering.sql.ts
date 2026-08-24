/**
 * Per-sender ordering + idempotency for `game_event`, added after its original
 * migration (same idempotent-alter pattern as create_match_history).
 *
 * `seq` alone cannot express the order a player acted in. It is assigned from
 * the row count when a request WINS THE INSERT RACE, so two overlapping requests
 * from the same client are recorded in an arbitrary order — and a log with an
 * attack recorded before the move that enabled it is unapplyable for every
 * client except the one that sent it. That is not hypothetical: it is what broke
 * match 11 (`yvwVsg1V2HRpKHrk`, seq 69/70).
 *
 *   sender_session — the AUTHENTICATED caller who relayed this event. Usually
 *                    the same as `user_session`, which is the acting seat; they
 *                    differ when a human drives a CPU seat, where the action is
 *                    attributed to the AI but ordered against its driver's
 *                    stream. NULL on rows written before this column existed.
 *   client_seq     — that sender's own 0-based counter for the room. Contiguous
 *                    per sender: it is the sender's Nth relayed action, whoever
 *                    it was attributed to.
 *
 * The unique index is the load-bearing part. It makes a re-sent request (a
 * browser retry, a double-fired handler) collide instead of appending the same
 * action twice, and it lets the append path detect an action that arrived ahead
 * of the sender's own earlier one and refuse it rather than recording history
 * out of order. Partial, so the legacy rows with NULLs don't all collide on one
 * key.
 */
export const CreateGameEventOrdering = `
alter table game_event add column if not exists sender_session text;

alter table game_event add column if not exists client_seq int;

create unique index if not exists game_event_sender_seq_idx
    on game_event (session, sender_session, client_seq)
    where sender_session is not null and client_seq is not null;
`
