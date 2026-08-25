/**
 * `matches.last_event_id` — where the room's event log stood when the match row
 * was written, added as a separate idempotent alter (same pattern as
 * create_match_history) so existing rows pick it up as NULL.
 *
 * The row and the log are written by different paths: clients append gameplay to
 * `game_event` all match, and whichever client reaches `gameOver` first POSTs the
 * result that becomes the row. Nothing used to tie the two together, so a row
 * could assert an outcome the log never produces and there was no way to tell
 * from the data — match 19 recorded a winner and an `ended_at` four and a half
 * minutes before its log stopped growing, and finding that took replaying 763
 * events by hand.
 *
 * With the anchor stored, "was this result recorded while the room was still
 * playing?" is `last_event_id < (select count(*) from game_event where ...) - 1`.
 */
export const CreateMatchAnchor = `
alter table matches add column if not exists last_event_id int;
`
