/**
 * Async (correspondence) multiplayer columns, added to `game_room` after its
 * original migration. Kept as a separate idempotent alter (same pattern as
 * create_game_room_settings) so existing rooms pick them up.
 *
 *   mode            — 'live' (default, websocket play) or 'async' (turns over
 *                     days). Chosen by the host at creation and immutable.
 *   turn_timeout_ms — the per-turn allowance for async rooms; clamped
 *                     server-side to [12h, 14d]. NULL for live rooms.
 *   turn_deadline   — millisecond epoch by which the current player must END
 *                     their turn or be auto-resigned. Armed when the game
 *                     starts, re-armed on every end-turn, cleared when the
 *                     match resolves. NULL for live rooms and unstarted lobbies.
 *
 * The `game_member (user_session)` index powers the "your async games" list,
 * which enumerates a player's rooms across sessions (the live flow only ever
 * looked rooms up by session, so the reverse lookup never needed one).
 */
export const CreateGameAsync = `
alter table game_room add column if not exists mode text default 'live';
alter table game_room add column if not exists turn_timeout_ms bigint;
alter table game_room add column if not exists turn_deadline bigint;
create index if not exists game_member_user_session_idx on game_member (user_session);
`
