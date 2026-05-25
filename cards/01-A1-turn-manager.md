---
id: A1
epic: A - Core turn loop
title: Turn manager and player roster
depends_on: []
---

# A1 — Turn manager and player roster

## Why this card exists

Right now in [`src/lib/Engine/GameStateManager.svelte`](../src/lib/Engine/GameStateManager.svelte) and [`src/lib/Engine/Interactor/interactor.ts`](../src/lib/Engine/Interactor/interactor.ts) there is no concept of whose turn it is. Either side can move any unit at any time. Nothing else in the backlog works until turns exist.

## Scope

Introduce game-state primitives that the rest of the engine will hang off of:

- A **`Player`** record per team: `{ team: number, name?: string, money: number, hasLost: boolean }`. Money starts at 0 for now — economy lands in C1.
- A **game-state store** (Svelte writable, lives in a new `src/lib/Engine/gameState.ts`) holding `{ players: Player[], currentTeam: number, turnNumber: number, actedTiles: Set<number>, phase: 'playing' | 'gameOver', winner?: number }`.
- A `derivePlayersFromMap(map)` helper: scans `map.layers.units` and `map.layers.buildings` for distinct team ids and constructs the players array.
- Wire `interactor.ts → select` to only allow selecting a unit whose `team === currentTeam` AND whose tile is not in `actedTiles`. When a unit's action resolves (move or attack), add its destination tile to `actedTiles`.
- Keep all changes pure where possible. The store is the only Svelte-aware piece; everything else exports plain functions.

## Acceptance criteria

- [ ] `src/lib/Engine/gameState.ts` exists, exports the store and helpers, has vitest coverage for `derivePlayersFromMap` and the `actedTiles` flow.
- [ ] Clicking a unit on a team that is not `currentTeam` does nothing (no highlights, no move menu).
- [ ] Once a unit moves or attacks, clicking it again on the same turn does nothing.
- [ ] `GameStateManager.svelte` initializes the store from the loaded `MapObject` and stops rendering the debug overlay (or replaces it with a tiny "Turn N — Player X" pill).
- [ ] Existing smoke test still passes.
- [ ] No regressions in the map editor (it doesn't use game state — verify it still loads and saves).

## Files likely to change

- `src/lib/Engine/gameState.ts` (new)
- `src/lib/Engine/GameStateManager.svelte`
- `src/lib/Engine/Interactor/interactor.ts`
- `tests/Engine/gameState.unit.test.ts` (new)

## Out of scope

- End-turn button (that's A2).
- Modifier dispatch (A3).
- Money mechanics (C1).
- Win conditions (D1).

## Notes for the coder

- Keep `actedTiles` a `Set<number>` of map tile indices; the existing engine identifies tiles by `y * cols + x`.
- The grayed-out "this unit has acted" visual already kinda works because `state` controls sprite frame. Don't get distracted — the rule is what matters; visual treatment can be a 1-line opacity change in `paint.ts` if obvious.
- Don't introduce a new state-management library. Svelte stores are fine.
