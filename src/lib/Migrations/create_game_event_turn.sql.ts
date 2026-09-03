/**
 * `game_event.next_turn` — who holds the turn after this row's run.
 *
 * The turn pointer was a write of its own on every end-turn:
 * `game_room.current_turn`, one update per turn on the budget that binds first.
 * The run's own row already knows the answer at insert time (the route resolves
 * the handover before it appends), so it rides along on the insert and the
 * pointer is READ as "the newest row's `next_turn`", falling back to the room
 * column for a room whose newest row predates this (or has none yet, where the
 * column holds the seeded starter).
 *
 * Async paths keep patching the column as well, since they write the room row
 * for the turn clock anyway and the async game list reads it in bulk.
 */
export const CreateGameEventTurn = `
alter table game_event add column if not exists next_turn text;
`
