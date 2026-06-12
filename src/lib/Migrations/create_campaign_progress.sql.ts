/**
 * `campaign_progress` — one row per account recording how far the single-player
 * campaign is unlocked (K3). `highest_unlocked_order` is the largest level
 * `order` (see `Campaign/levels.ts`) the player may enter; the J1 match-end
 * subscriber (`campaignProgress`) raises it on a campaign win via the pure
 * `advanceProgress` rule. Signed-out play mirrors the same integer in
 * `localStorage`, so the unlock logic is identical on both paths.
 *
 * `user_auth` is `unique` so the write-through can upsert cleanly. It defaults
 * to `1` (the first level) so a brand-new row already has level 1 unlocked.
 */
export const CreateCampaignProgress = `
create table if not exists campaign_progress (
    id serial primary key,
    user_auth text references profiles(auth) unique,
    highest_unlocked_order int not null default 1,
    updated_at timestamp default current_timestamp
);
`
