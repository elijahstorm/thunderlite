/**
 * Match seeds, added to `game_room` and `matches` after their original
 * migrations. Kept as separate idempotent alters (same pattern as
 * create_game_async / create_match_anchor) so existing rows pick them up.
 *
 *   game_room.seed — the random seed the room is played under, chosen once at
 *                    creation. Every client reads the same value, so a player
 *                    who rejoins mid-match resolves scripted spawns and CPU
 *                    tie-breaks exactly as the players already in the room did.
 *                    A rematch creates a new room, so it gets a new seed and the
 *                    same map does not play out the same way twice.
 *
 *   matches.seed   — the seed a finished match was played under, stamped at
 *                    result time so a replay can reconstitute its rolls. Read
 *                    from the room row for online results rather than taken from
 *                    the client, which has no authority over it.
 *
 * Both are NULL on rows written before this existed. A room with no stored seed
 * falls back to a hash of its session id (see `Engine/matchSeed`), which every
 * client derives identically — so in-flight rooms keep agreeing across the
 * deploy instead of forking mid-match.
 */
export const CreateGameSeed = `
alter table game_room add column if not exists seed bigint;
alter table matches add column if not exists seed bigint;
`
