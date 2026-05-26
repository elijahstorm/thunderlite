---
id: B3
epic: B - Combat realism
title: Terrain end-of-turn damage and volcano-blocks-air rule
depends_on: [A2]
---

# B3 — Terrain end-of-turn damage and volcano-blocks-air rule

## Why this card exists

Two declared but unimplemented terrain rules:

- `terrainData[].damage` is set on Wasteland (10) and Rock Formation (20) but nothing applies it.
- [`movement.ts:84`](../src/lib/Engine/Interactor/Pathing/movement.ts) lets air units cross _any_ terrain, including Volcanoes which the wiki says are impassable to everyone.

## Scope

- In the A2 end-turn pipeline, after `End_Turn.*` handlers run for the team that just ended its turn, walk that team's units and apply `terrainData[unit.tile.ground].damage` if > 0. Clamp to 0; trigger explosion animation if the unit dies.
- Update `validTerrain` in [`movement.ts`](../src/lib/Engine/Interactor/Pathing/movement.ts) so air units cannot enter `terrainData[t].details === 'impassable'` (Volcano).

## Acceptance criteria

- [ ] A friendly Strike Commando on Wasteland at the moment of end-turn loses 10 HP. If it had ≤ 10, it dies (tile cleared, explosion animation plays).
- [ ] A friendly Corvette on Rock Formation loses 20 HP at end-turn.
- [ ] Raptor Fighter cannot path through a Volcano tile (highlight excludes it; pathfinder won't return a route through it).
- [ ] Vitest: pure end-of-turn-damage helper; volcano air-block in `validTerrain`.
- [ ] No regression: ground/sea movement onto non-impassable terrain still works.

## Files likely to change

- `src/lib/Engine/Interactor/Pathing/movement.ts`
- `src/lib/Engine/turnLoop.ts` (add the damage step)
- `src/lib/Engine/combat.ts` (reuse explosion animation hook, no new visuals needed)
- `tests/Engine/turnLoop.unit.test.ts`
- `tests/Engine/movement.unit.test.ts` (new)

## Out of scope

- Healing modifiers (already covered partially in A3's `Heal_Team`).
- Weather damage (F3).

## Notes for the coder

- Damage at end-of-turn applies to the _team that just ended its turn_, before turn advances. Apply before `currentTeam` increments.
- Use the existing `animateExplosion` helper from `animator.ts` when a unit dies from terrain.
- Don't introduce new terrain types or modifier keys.
