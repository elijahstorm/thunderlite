---
id: C2
epic: C - Economy & production
title: Building capture (Normal mode)
depends_on: [A3, C1]
---

# C2 — Building capture (Normal mode)

## Why this card exists

Infantry units have `Start_Turn.Capture` declared. Buildings have a `stature` value (20 for most, 30 for Command Center). The Flash original ([`old/modifiers.js`](../src/lib/GameData/old/modifiers.js) `Start_Turn.Capture`) reduces stature each turn the capturing unit holds the tile; at 0 the building flips to the new team.

## Scope

- Add `building.stature: number` to runtime building objects (default = `buildingData[type].stature`). Persist on the building layer.
- Implement `Start_Turn.Capture` handler:
  1. If unit standing on an enemy or neutral building → reduce `building.stature` by `unit.health / unitMaxHealth * 10`, rounded.
  2. If `building.stature <= 0` → set `building.team = unit.team`, reset `stature` to its max, fire any `Capture.*` modifiers on the building (`Capture.Allow_Ground`, `Capture.Allow_Air`, `Capture.Allow_Sea`). `Capture.Insta_Lose` is wired in D1.
- Show capture progress in the unit-info HUD (E1 will create the panel; for C2, just add a small numeric overlay on captured buildings — keep it minimal).
- Player gains/loses control flags when capture flips: a `controls: { ground, air, sea }` map on Player. When an Allow_X building is captured, set that flag true for the new owner; if the old owner had it as their only such building, clear it for them.

## Acceptance criteria

- [ ] Vitest: a Strike Commando at full HP standing on a neutral City reduces its stature by 10 each start-of-turn; after 2 turns the building flips.
- [ ] Wounded unit captures slower: half-HP unit reduces stature by 5.
- [ ] On flip, the building visibly changes team (sprite re-colorizes via the existing color pipeline — set `building.team` and the renderer should handle it).
- [ ] Capturing Ground Control sets the new owner's `controls.ground = true`; the previous owner loses it if they had no other Ground Control.
- [ ] No regression in the editor placing buildings.

## Files likely to change

- `src/lib/Engine/modifiers/capture.ts` (new)
- `src/lib/Engine/modifiers/captureAllow.ts` (new — handles `Capture.Allow_*`)
- `src/lib/Engine/gameState.ts` (add `controls` to Player)
- `src/lib/Engine/modifiers/index.ts`
- `tests/Engine/capture.unit.test.ts`

## Out of scope

- `Capture.Insta_Lose` (D1).
- Build menu (C3).

## Notes for the coder

- The map layer stores `BuildingObject = ObjectType & AnimatedObject & TeamObject`. To add `stature` you'll likely widen this type — fine, but update the editor's serializer to default it.
- `Start_Turn.Capture` runs at _start_ of the capturing unit's player's turn. Make sure the dispatcher walks units in the right order.
