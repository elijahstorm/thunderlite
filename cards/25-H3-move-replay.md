---
id: H3
epic: H - Multiplayer
title: Move serialization and replay on reconnect
depends_on: [H2]
---

# H3 — Move serialization and replay on reconnect

## Why this card exists

H2 introduces a server-side event log. H3 cements the event schema and uses it for reconnect and post-match replay.

## Scope

- Solidify the `SerializedAction` discriminated union:
  ```ts
  type SerializedAction =
  	| { kind: 'move'; from: number; to: number }
  	| { kind: 'attack'; from: number; to: number }
  	| { kind: 'capture'; tile: number }
  	| { kind: 'build'; building: number; unitType: number; direction?: number }
  	| { kind: 'mine'; tile: number }
  	| { kind: 'repair'; tile: number }
  	| { kind: 'transport-load'; transport: number; passenger: number }
  	| { kind: 'transport-unload'; transport: number; tile: number }
  	| { kind: 'wait'; tile: number }
  	| { kind: 'end-turn' }
  ```
- `applyAction(state, action)` pure function: deterministic, used both for server-side validation and client replay.
- On `GameSocket` connect/reconnect, fetch the full event log and replay through `applyAction` to reach current state.

## Acceptance criteria

- [ ] All in-game actions serialize through the union; the interactor no longer has a direct mutation path that bypasses `applyAction`.
- [ ] Refreshing the page during a match restores the full game state by replaying.
- [ ] Vitest: applying the same event log twice produces identical state.

## Files likely to change

- `src/lib/Engine/actions.ts` (new)
- `src/lib/Engine/Interactor/interactor.ts`
- `src/lib/Components/Socket/GameSocket.svelte`
- `tests/Engine/actions.unit.test.ts`

## Out of scope

- Match replay viewer UI.
- Undo / rewind.

## Notes for the coder

- Determinism is the goal. No `Math.random()` unless seeded. No `Date.now()` in `applyAction`.
- Animations are side-effects of dispatching an action, not part of the state. Keep them in a separate effect layer.
