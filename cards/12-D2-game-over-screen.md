---
id: D2
epic: D - Win conditions
title: Game over screen
depends_on: [D1]
---

# D2 — Game over screen

## Why this card exists

When `phase === 'gameOver'` the screen needs to announce a winner and offer a path back to `/rooms`.

## Scope

- New `src/lib/Engine/HUD/GameOverModal.svelte`.
- When `phase === 'gameOver'`, render the modal centered over the map (existing pointer-events overlay pattern is fine).
- Show:
    - "Victory" or "Defeat" relative to the local user's team (game state already tracks `currentTeam` and we know which team the local user is — use `userSession` matching for now, or default team 0).
    - Player summary (winner team number + each player's `hasLost` status).
    - A button "Back to Rooms" linking to `/rooms`.
- Do not implement re-match or replay yet.

## Acceptance criteria

- [ ] When `phase === 'gameOver'` the modal appears and blocks tile clicks.
- [ ] Clicking the back-to-rooms button navigates to `/rooms`.
- [ ] If `phase !== 'gameOver'` the modal isn't mounted.
- [ ] Smoke test still passes.

## Files likely to change

- `src/lib/Engine/HUD/GameOverModal.svelte` (new)
- `src/lib/Engine/GameStateManager.svelte`
- maybe `src/routes/(app)/play/+page.svelte`

## Out of scope

- Stats tracking, replays, post-match analytics.

## Notes for the coder

- Functional, not pretty. Centered absolutely positioned div with a title and a button is sufficient.
- Don't bind the local player team to anything new — there's no per-user team assignment yet. Default to team 0 = "you"; we'll fix that when H1 lands.
