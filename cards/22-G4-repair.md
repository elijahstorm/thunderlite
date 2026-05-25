---
id: G4
epic: G - Special unit abilities
title: Self-action Repair
depends_on: [E2]
---

# G4 — Self-action Repair

## Why this card exists

`Self_Action.Repairable` is on most units. The original behavior: spend your turn to heal 25% of max HP (capped at max).

## Scope

- Action menu (E2) offers "Repair" when the selected unit has `Self_Action.Repairable` and `health < max`.
- On select: `unit.health = min(maxHealth, health + maxHealth * 0.25)`. Mark as acted. No movement, no attack.

## Acceptance criteria

- [ ] Wounded Scorpion Tank choosing Repair gains 25% of max HP (clamped to max).
- [ ] Repair consumes the unit's action (can't move/attack afterward this turn).
- [ ] Units with `Self_Action.Irreparable` (e.g. Raptor Fighter, Blockade) do NOT see Repair in the menu.
- [ ] Vitest.

## Files likely to change

- `src/lib/Engine/modifiers/repair.ts` (new)
- `src/lib/Engine/HUD/ActionMenu.svelte` (gate the Repair entry)
- `tests/Engine/repair.unit.test.ts`

## Notes for the coder

- Rounding: integer HP everywhere. Use floor or round consistently with the rest of the engine (look at B1's rounding convention and match it).
