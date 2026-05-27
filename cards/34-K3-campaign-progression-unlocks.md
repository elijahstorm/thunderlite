---
id: K3
epic: K - Single-player campaign
title: Campaign progression and unlock-on-win (via match-end hook)
depends_on: [K2, J1]
---

# K3 — Campaign progression and unlock-on-win

## Why this card exists

The original game tracked `story_prog` and unlocked the next level when you beat the current one. The user wants: beat level 1 → level 2 unlocks → auto-continue. This card owns the progression data and the unlock logic, and it fires **from the J1 match-end hook** so the same mechanism that records stats and (later) elo also advances the campaign.

## Scope

- A campaign level registry `src/lib/Campaign/levels.ts`: an ordered list of level descriptors `{ id, order, title, mapSha, scriptPath }`. Content comes in K5; this card defines the shape and a stub list.
- Migration under `src/lib/Migrations/`: `campaign_progress (user_auth, highest_unlocked_order, updated_at)`. For signed-out play, mirror progress in `localStorage` so the campaign is playable without an account.
- A J1 subscriber `src/lib/Campaign/progress.ts`:
  - on a `mode: 'campaign'` win, set `highest_unlocked_order = max(current, level.order + 1)` (capped at the last level)
  - pure core `advanceProgress(current, beatenOrder) → number` so it's testable and identical for DB and localStorage paths
- Read helpers: `getUnlockedOrder(user)` and `isUnlocked(levelId, user)`.

## Acceptance criteria

- [ ] Beating campaign level 1 raises the unlocked order so level 2 becomes playable; level 3+ stay locked.
- [ ] Replaying an already-beaten level does not regress progress.
- [ ] A brand-new account (or signed-out player) starts with only the first level unlocked.
- [ ] Progress persists across sessions (DB when signed in, localStorage otherwise).
- [ ] Vitest: `advanceProgress` respects the cap and never regresses.

## Files likely to change

- `src/lib/Campaign/levels.ts` (new — registry + shape; stub entries)
- `src/lib/Campaign/progress.ts` (new — J1 subscriber + pure `advanceProgress`)
- `src/lib/Migrations/NNNN_campaign_progress.sql` (new)
- `tests/Campaign/progress.unit.test.ts`

## Out of scope

- The title-screen entry, level select, and continue/auto-advance UI (K4).
- The actual level maps and scripts (K5).

## Notes for the coder

- `progress.ts` is just another `onMatchEnd` subscriber, peer to `recordMatch` (J3). It must not reach into the stats screen or UI.
- Keep the unlock rule pure (`advanceProgress`) so signed-in and signed-out paths share one tested function.
