---
id: F1
epic: F - Fog of war & visibility
title: Per-team sight masks (fog of war)
depends_on: [A1]
---

# F1 — Per-team sight masks (fog of war)

## Why this card exists

`unitData[].sight` exists on every unit (2 to 6 tiles) but nothing uses it. Without fog, every unit is always visible.

## Scope

- New `src/lib/Engine/visibility.ts`:
  - `computeTeamVisibility(map, team) → Set<number>`: union of every owned unit's sight diamond.
  - Modifier hook: `Properties.Extra_Sight` on terrain (`Hills`, `Mountain`) adds +1 to ranged units and +1-2 to non-ranged when _standing_ on that terrain.
- Renderer: in `paint.ts`, dim tiles not in the current player's visibility. Enemy units on non-visible tiles are not drawn (renderer-level hiding, not deletion).
- Attack/hover highlighting must respect visibility — you can't target what you can't see.

## Acceptance criteria

- [ ] Place enemy unit out of all your units' sight radii → it's invisible on the rendered map.
- [ ] Move one of your units adjacent → enemy becomes visible.
- [ ] A ranged unit on Hills gets +1 sight while standing there; when it moves off, sight returns to base.
- [ ] Vitest for `computeTeamVisibility`.

## Files likely to change

- `src/lib/Engine/visibility.ts` (new)
- `src/lib/Engine/paint.ts`
- `src/lib/Engine/Interactor/Pathing/attack.ts` (filter targets by visibility)
- `src/lib/Engine/modifiers/extraSight.ts` (new)
- `tests/Engine/visibility.unit.test.ts`

## Out of scope

- Cloak/stealth specifics (F2).
- Weather hiding air units (F3).

## Notes for the coder

- Visibility recomputes on movement and end-turn. Cache per turn.
- "Local team" means the team whose turn it is for hot-seat play. When H1 lands, this will become "your team" specifically.
