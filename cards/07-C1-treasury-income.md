---
id: C1
epic: C - Economy & production
title: Per-player treasury and start-of-turn income tick
depends_on: [A2, A3]
---

# C1 — Per-player treasury and start-of-turn income tick

## Why this card exists

Players have a `money` field (from A1) but nothing fills it. Buildings declare income (`City: 120`, `Oil Rig: 120`, `Oil Refinery: 60`) but never pay out.

## Scope

- Implement the `Each_Turn.Supply_Income` modifier handler. On start-of-turn for player P:
    1. Iterate `map.layers.buildings` for all buildings owned by P (`team === P.team`).
    2. For each, look up `buildingData[building.type].income` and add it to `P.money`.
- Add a small HUD widget `src/lib/Engine/HUD/Treasury.svelte` showing the **current player's** money. It should be a sibling of `TurnPill.svelte`.
- Optional: pin a small starting-money config on the game state (`startingMoney = 0` for now; later cards may set it from map metadata).

## Acceptance criteria

- [ ] Vitest: starting with 0 money and one owned City, after one full round the player has 120 money. With one City + one Oil Refinery → 180.
- [ ] HUD treasury updates after end-turn.
- [ ] Income only applies to buildings owned by the player whose turn is **starting** — not to neutral or enemy buildings.
- [ ] No regressions.

## Files likely to change

- `src/lib/Engine/modifiers/supplyIncome.ts` (new)
- `src/lib/Engine/modifiers/index.ts` (register handler)
- `src/lib/Engine/HUD/Treasury.svelte` (new)
- `src/lib/Engine/GameStateManager.svelte` (mount Treasury)
- `tests/Engine/supplyIncome.unit.test.ts` (new)

## Out of scope

- Capture mechanics (C2). Treat buildings as if they have an `owner` already; for testing, set `building.team` directly.
- Spending money on units (C3).

## Notes for the coder

- A neutral building uses `team === undefined` or a sentinel — check the editor's saved structure. Don't break the editor's "place building with no team" path; treat undefined team as "no owner, no income".
- The HUD widget should be dumb. Read from the gameState store. Don't put business logic in the component.
