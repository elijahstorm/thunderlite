---
id: A2
epic: A - Core turn loop
title: End-turn action and start-of-turn pipeline
depends_on: [A1]
---

# A2 — End-turn action and start-of-turn pipeline

## Why this card exists

A1 gives us a `currentTeam` but no way to change it. Without an end-turn flow the game can never progress past turn 1.

## Scope

Build the turn-advancement machinery:

- `endTurn()` function exported from `src/lib/Engine/turnLoop.ts` (new). It:
  1. Runs `End_Turn.*` modifier handlers over every unit on the current team (stub the handlers in A3 — for now an empty `runModifiers` registry call is fine, but the seam must be wired).
  2. Advances `currentTeam` to the next non-lost player (wraps around). When wrapping, increments `turnNumber`.
  3. Clears `actedTiles`.
  4. Runs `Start_Turn.*` then `Each_Turn.*` handlers over every unit AND every building on the new current team.
- An "End Turn" button in a new `src/lib/Engine/HUD/TurnPill.svelte` component, mounted by `GameStateManager.svelte`. Button is disabled when `phase !== 'playing'`.
- A `runModifiers(target, phase, ctx)` registry seam in `src/lib/Engine/modifiers/index.ts` (new). For A2 it's a no-op switchboard: every modifier key resolves to `() => {}`. A3 fills in the real handlers.

## Acceptance criteria

- [ ] Clicking "End Turn" increments `currentTeam` and, when it wraps to player 0, increments `turnNumber`.
- [ ] After end-turn, `actedTiles` is empty and previously-acted units become selectable again (for the new active player's own units).
- [ ] `runModifiers` exists, accepts `(unit | building, phase, ctx)`, looks up handlers by modifier key, and calls each in declaration order. A vitest covers: an empty handler set is safe; a registered handler is invoked.
- [ ] `endTurn` skips players whose `hasLost` is true.
- [ ] The HUD pill shows "Turn N — Player X" and updates on end-turn.
- [ ] No regressions.

## Files likely to change

- `src/lib/Engine/turnLoop.ts` (new)
- `src/lib/Engine/modifiers/index.ts` (new — registry only)
- `src/lib/Engine/HUD/TurnPill.svelte` (new)
- `src/lib/Engine/GameStateManager.svelte`
- `tests/Engine/turnLoop.unit.test.ts` (new)

## Out of scope

- Implementing any concrete modifier handler (that's A3).
- Income (C1).
- Win checks on end-turn (D1).

## Notes for the coder

- Pull the player advancement out as a pure helper so it's unit-testable without Svelte.
- The TurnPill should be dumb — receives store as a prop or subscribes. Don't put game logic in it.
