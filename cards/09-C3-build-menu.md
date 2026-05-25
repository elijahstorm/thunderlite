---
id: C3
epic: C - Economy & production
title: Build menu and unit production from Warfactory
depends_on: [C1, C2]
---

# C3 — Build menu and unit production from Warfactory

## Why this card exists

[`buildingData[].actable`](../src/lib/GameData/building.ts) is true for the Warfactory but selecting one does nothing. Players need a way to spend money to spawn units.

## Scope

- When the active player selects their own actable building (`actable: true`), open a `BuildMenu` modal in `src/lib/Engine/HUD/BuildMenu.svelte`.
- Menu lists every unit from `unitData` filtered by:
    - The unit's `type` (`ground` / `air` / `sea`) is allowed by the player's `controls` flags (set via C2 Allow_* capture).
    - `unit.cost > 0` (excludes Turret, Blockade, Leviathan, Transporter — those have 0 cost and aren't player-buildable).
    - Player has enough money.
- On select: deduct cost from player money, spawn unit on the building's tile (or adjacent if occupied — fail and toast if both impossible), mark unit as **already acted this turn** (push tile to `actedTiles`), close menu.

## Acceptance criteria

- [ ] Captured Ground Control + Warfactory + 270 money → can build Scorpion Tank; money becomes 0; unit appears, can't move this turn.
- [ ] Without Air Control captured, air units are disabled (greyed) in the menu.
- [ ] Without enough money, every entry is disabled and shows the cost.
- [ ] Building menu can be cancelled (Escape or a Cancel button) with no side effects.
- [ ] Vitest: pure helper `buildableUnits(player, building) → UnitData[]` covers gating logic.

## Files likely to change

- `src/lib/Engine/HUD/BuildMenu.svelte` (new)
- `src/lib/Engine/build.ts` (new — `buildableUnits`, `spawnBuiltUnit`)
- `src/lib/Engine/Interactor/interactor.ts` (route `actable` building click to BuildMenu)
- `tests/Engine/build.unit.test.ts`

## Out of scope

- Warmachine builder/miner (C4).
- Reachability-based spawn placement beyond "tile or one adjacent".

## Notes for the coder

- BuildMenu reads from gameState. Spawn logic is in `build.ts`, not in the component.
- Use existing sprite previews from `spriteStore` for the menu items — the map editor already does this.
- Don't try to position the modal pretty. A centered absolute div is fine.
