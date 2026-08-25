/**
 * `follows` is gone.
 *
 * The table only ever recorded a directed edge: nothing in the app read the
 * graph back. There was no follower count, no followers list, no feed, and no
 * effect on matchmaking or the friends hub — the sole observable result of
 * following someone was one email and a button that said "Following". In a game
 * whose social model is friends (mutual, and what the lobby and chat actually
 * use) a one-way subscription had no job to do, so it was removed rather than
 * given one.
 *
 * Runs LAST in the consolidated schema, after every `create table if not
 * exists`, and is idempotent like the rest of it: a database that never had the
 * table drops nothing. `cascade` is what clears the FKs the old rows held
 * against `profiles(auth)`.
 */
export const DropFollows = `
drop table if exists follows cascade;
`
