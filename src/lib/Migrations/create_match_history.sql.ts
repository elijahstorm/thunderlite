/**
 * Reviewable match history + elo columns, added to `matches` / `match_players`
 * after their original migrations. Kept as a separate idempotent alter (same
 * pattern as create_game_async) so existing rows pick them up.
 *
 * On `matches`:
 *   map_id — the played map's `maps.public_id`, recorded at settlement so the
 *            replay viewer can re-derive the board without the (TTL-bound)
 *            `game_room` row. NULL for hotseat/campaign and legacy rows.
 *   rated  — TRUE once elo has been applied to this match (online, exactly two
 *            humans, both teams known). Display flag only; the authoritative
 *            per-player numbers live on `match_players`.
 *
 * On `match_players`:
 *   elo_before — the player's rating going INTO the match. NULL when unrated.
 *   elo_delta  — the signed rating change this match produced. NULL when
 *                unrated (a 0 is a real "rated, no change" draw).
 *
 * The `match_players (user_auth)` index powers the "my games" history list,
 * which pages a player's rows newest-first (stats already scanned this column,
 * but only ever unpaged and unordered).
 */
export const CreateMatchHistory = `
alter table matches add column if not exists map_id text;
alter table matches add column if not exists rated boolean default false;
alter table match_players add column if not exists elo_before int;
alter table match_players add column if not exists elo_delta int;
create index if not exists match_players_user_auth_idx on match_players (user_auth);
`
