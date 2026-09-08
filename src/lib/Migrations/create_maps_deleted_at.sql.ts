/**
 * Soft-delete for maps, added after the original `maps` migration (same
 * idempotent-alter pattern as create_match_history).
 *
 * `deleted_at` — set when the owner deletes a map. The row is never actually
 * removed: live/async games only ever hold a `map_id` and re-fetch this row
 * on every read (see getMapData), so keeping it around lets in-progress
 * matches and their replays keep working after deletion. Discovery surfaces
 * (browse, my maps, profile lists) and new-game creation filter it out;
 * `getMapData` deliberately does not, so gameplay is unaffected.
 */
export const CreateMapsDeletedAt = `
alter table maps add column if not exists deleted_at timestamp;
`
