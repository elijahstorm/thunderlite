---
id: F2
epic: F - Fog of war & visibility
title: Cloak, stealth, tracking, radar, jammer
depends_on: [F1]
---

# F2 — Cloak, stealth, tracking, radar, jammer

## Why this card exists

Stealth Tank, U-Boat, Jammer Truck, and Strike Commando have related modifiers (`End_Turn.Cloak`, `Move.Tracking`, `Move.Radar`, `Idle.Jamming`) that are all stubbed.

## Scope

Implement each modifier per the old engine's semantics:

- `End_Turn.Cloak` (Stealth Tank, U-Boat): at end-of-turn, if no enemy unit is adjacent, mark the unit `hidden = true`. Hidden units are not rendered to the enemy and not in their attack target list. When an enemy moves adjacent, the unit unhides.
- `Move.Tracking` (Strike/Heavy Commando, Intrepid, Hunter Support): if this unit moves adjacent to a cloaked enemy, the enemy unhides.
- `Move.Radar` (Jammer Truck): at start of the unit's player's turn, reveal all cloaked enemies in range [2,3].
- `Idle.Jamming` (Jammer Truck): area of [2,3] around the jammer blocks enemy air units from entering. Pathfinder must respect this for the enemy player.

## Acceptance criteria

- [ ] Stealth Tank ending its turn with no adjacent enemy → invisible to the opposing team.
- [ ] Strike Commando moving adjacent to a cloaked Stealth Tank → reveals it.
- [ ] Jammer Truck within [2,3] of an enemy Raptor Fighter → reveals it at start-of-turn.
- [ ] Enemy Raptor Fighter cannot path through Jammer Truck's [2,3] range.
- [ ] Vitest covers each modifier in isolation.

## Files likely to change

- `src/lib/Engine/modifiers/cloak.ts` (new)
- `src/lib/Engine/modifiers/tracking.ts` (new)
- `src/lib/Engine/modifiers/radar.ts` (new)
- `src/lib/Engine/modifiers/jamming.ts` (new)
- `src/lib/Engine/Interactor/Pathing/movement.ts` (jamming block for air)
- `src/lib/Engine/visibility.ts` (hidden unit handling)

## Out of scope

- Visual cloak animation (the existing alpha fade in the old code is nice-to-have, not required).
- Weather hiding (F3).

## Notes for the coder

- The `hidden` flag is per-unit, per-frame. Don't persist it in the saved map — it's recomputed.
- Be careful with bidirectional movement: a friendly cloaked unit can still see and target enemies.
