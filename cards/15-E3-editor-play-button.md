---
id: E3
epic: E - HUD & UX
title: Editor "Play" button actually launches a game
depends_on: [A1]
---

# E3 — Editor "Play" button actually launches a game

## Why this card exists

[`MapEditor.svelte:62-66`](../src/lib/Map/MapEditor.svelte) has a "play" action that toasts "JK not implemented yet!". With even partial game logic landed, hitting Play should drop the current editor map straight into a playable session.

## Scope

- Replace the JK toast with:
    1. Compute the map hash via `mapHasher(map)`.
    2. POST to `/api/game` with `{ sha }`. If the map isn't saved to DB yet, fall back to passing the hash to `/play` via querystring/state and letting `MapLoader` derive the map from the hash directly (the editor already has it in the `mapStore`, so the in-memory `mapStore` should be picked up by `MapLoader`).
    3. `goto('/play')`.
- The user is allowed to play an unsaved editor map for one session. Save flow is unchanged.

## Acceptance criteria

- [ ] From the editor, clicking Play loads the in-progress map into `/play` and starts a fresh game session (player 0 = team 0, etc).
- [ ] If the user is not logged in, they're redirected to login (this is already handled by `hooks.server.ts`).
- [ ] Saved-map flow still works (browse from `/make`, pick a saved map, hit "make game").

## Files likely to change

- `src/lib/Map/MapEditor.svelte`
- maybe `src/lib/Map/MapLoader.svelte` (to handle in-memory map from store)
- maybe `src/routes/(app)/play/+page.server.ts` (allow a session that uses ephemeral map)

## Out of scope

- Validation that the map is playable (e.g., that each team has at least one HQ). Add a warning toast if you want; not required.

## Notes for the coder

- `MapLoader` already prefers `$mapStore` over the URL-derived hash. Verify and reuse that path.
- If the API requires a saved SHA, the simplest path is to also save the map to DB first (then call `/api/game`). Pick the simplest path and document it.
