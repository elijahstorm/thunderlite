/**
 * `game_room.max_players` — a room's seat count, derived from its MAP.
 *
 * Rooms used to be hard-capped at two seats by a module constant, which quietly
 * broke every map the editor can actually produce: a three- or four-side board
 * filled its two seats, started, and then deadlocked the moment the engine's
 * turn rotation reached a side no member owned (no client commands it, so no
 * action and no end-turn can ever come from it). Capacity now travels with the
 * room: it is computed from the map's team count when the room is created and
 * clamped server-side to [MIN_ROOM_PLAYERS, MAX_ROOM_PLAYERS].
 *
 * Kept as a separate idempotent alter (same pattern as create_game_async /
 * create_game_ready) so existing rooms pick the column up. Default 2 — that is
 * exactly the behaviour every room predating this column was created with.
 */
export const CreateGameCapacity = `
alter table game_room add column if not exists max_players integer default 2;
`
