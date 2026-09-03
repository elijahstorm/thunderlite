/**
 * `game_room.surrendered` — the teams that have quit this room, as a JSON array
 * of team numbers. Kept as a separate idempotent alter (same pattern as the
 * other `game_room` additions) so existing rooms pick it up.
 *
 * Which sides are still in used to be derived by reading the room's ENTIRE
 * event log and scanning it for surrender actions: on every end-turn (to rotate
 * past quitters) and on every surrender (to refuse a second one). That read
 * grew with the match and was a fifth of an end-turn's gateway cost. A side
 * quitting is a fact about the room, so it lives on the room row, written once
 * when the surrender is recorded (see `appendEvent`) and read with the row the
 * hot routes already fetch.
 *
 * NULL means a room from before this column existed; readers fall back to the
 * log scan for those, so a match in progress across the deploy keeps rotating
 * correctly. New rooms default to `[]` and never scan.
 */
export const CreateGameRoomStanding = `
alter table game_room add column if not exists surrendered jsonb default '[]'::jsonb;
`
