/**
 * Lobby-settings columns added to `game_room` after its original migration.
 * Kept as a separate idempotent alter (rather than editing create_game_room)
 * so already-migrated rooms pick them up and parallel edits to the base
 * migration don't collide.
 *
 *   is_public   — listed on the public /rooms browser when true (default true).
 *   lock_random — host locked every seat to random; nobody may pick a slot.
 *   last_seen   is tracked per-member (game_member), not here.
 */
export const CreateGameRoomSettings = `
alter table game_room add column if not exists is_public boolean default true;
alter table game_room add column if not exists lock_random boolean default false;
alter table game_room add column if not exists rematch_session text;
`
