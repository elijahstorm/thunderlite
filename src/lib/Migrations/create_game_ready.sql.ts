/**
 * `game_member.ready` — the pre-game "I am at my keyboard" flag for LIVE rooms.
 *
 * A full live lobby used to arm its 10s countdown the instant the last seat
 * filled, which dropped a player into a match they were not looking at. Now the
 * countdown only arms once every human seat has readied up; the flag is cleared
 * on any change to the lineup (a join, a seat/side change, an AI added or a
 * player removed) so nobody's ready survives into a setup they did not agree to.
 *
 * Async rooms ignore this entirely — correspondence players are expected to be
 * away, so those lobbies still release on their own.
 *
 * Kept as a separate idempotent alter (same pattern as create_game_async) so
 * existing rooms pick the column up. Default FALSE: every seat in a room that
 * predates this starts un-readied, which is the safe direction.
 */
export const CreateGameReady = `
alter table game_member add column if not exists ready boolean default false;
`
