---
id: G3
epic: G - Special unit abilities
title: Transport — load and unload via Transporter and Leviathan
depends_on: [E2]
---

# G3 — Transport — load and unload via Transporter and Leviathan

## Why this card exists

Strike Commando and Heavy Commando have `Self_Action.Transport`. Leviathan and Transporter have `Self_Action.Land`. The original game lets infantry hop into an air transport or a sea leviathan and disembark elsewhere. None of this works today.

## Scope

- `Self_Action.Transport`: action option on a Commando standing adjacent to a friendly Transporter. On select, the Commando is absorbed (removed from the map); the Transporter records `rescuedUnit` reference and ports the Commando's current/max HP ratio onto the Transporter's HP.
- `Self_Action.Ship_Out`: same mechanism but for ground units on Shore terrain — wraps them in a Loading Boat / Leviathan. (Port from old code as Leviathan is the existing in-tree unit.)
- `Self_Action.Land`: action option on a transport with a `rescuedUnit`. Pick an adjacent passable tile for the carried unit's movement type; restore the unit, transport is consumed.

## Acceptance criteria

- [ ] Commando next to a friendly Transporter can Transport → Commando disappears; Transporter holds the rescued unit reference; Transporter HP ratio reflects the Commando's HP ratio.
- [ ] Transporter holding a unit can Land on an adjacent valid tile → Commando reappears; Transporter is removed.
- [ ] Air transport can carry across normally-impassable ground (forest, mountain) — that's the whole point.
- [ ] Vitest covers load/unload state transitions.

## Files likely to change

- `src/lib/Engine/modifiers/transport.ts` (new — covers Transport, Ship_Out, Land)
- `src/lib/Engine/Interactor/interactor.ts`
- `tests/Engine/transport.unit.test.ts`

## Out of scope

- Carrying multiple units. One-at-a-time only.

## Notes for the coder

- `rescuedUnit` lives on the runtime UnitObject, not in the saved map shape. Don't change the serializer.
- Land requires the destination tile to be valid for the rescued unit's movement type. Use the existing `validTerrain` and `drag` helpers.
