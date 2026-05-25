---
id: C4
epic: C - Economy & production
title: Warmachine — adjacent build, ore mining, instant-loss on death
depends_on: [C3]
---

# C4 — Warmachine — adjacent build, ore mining, instant-loss on death

## Why this card exists

The Warmachine ([`unitData` "Warmachine"](../src/lib/GameData/unit.ts)) declares three special modifiers: `Self_Action.Builder`, `Self_Action.Miner`, `Death.Insta_Lose`. None are implemented. The Warmachine is the centerpiece of Blitz mode.

## Scope

- `Self_Action.Builder` handler: opens the same BuildMenu as C3 but constrained to spawn on an **adjacent** passable empty tile (the player picks the direction after selecting a unit). Deducts cost from player money. Newly-built unit is marked as acted this turn.
- `Self_Action.Miner` handler: only available when standing on Ore Deposit terrain (`Ore Deposit`, `Enriched Ore Deposit`, `Depleted Ore Deposit`). On use:
    - Adds 500 money to the player.
    - Downgrades the tile: Enriched → Ore → Depleted → Plains. (Mirror the old engine's `Source + 1` logic.)
    - Marks the Warmachine as acted.
- `Death.Insta_Lose` handler: when a unit with this modifier dies, check the owner — if they have no other unit with `Death.Insta_Lose` AND no Command Center, set `player.hasLost = true` (and run the D1 win-check loop).

## Acceptance criteria

- [ ] Warmachine on an Enriched Ore Deposit can mine → player +500 money, tile changes to plain Ore Deposit, Warmachine acted.
- [ ] Mining a Depleted Ore Deposit converts it to Plains and yields the final +500.
- [ ] Selecting a Warmachine reveals "Build" and "Mine" actions in the action menu (E2) — but C4 lands before E2, so for now hard-wire the two actions on Warmachine selection via the existing interactor flow. Document the temporary coupling and remove it in E2.
- [ ] Killing the only Warmachine of a player with no Command Center sets `player.hasLost = true`.
- [ ] Vitest covers: mining tile transitions, instant-loss check, build adjacency.

## Files likely to change

- `src/lib/Engine/modifiers/builder.ts` (new)
- `src/lib/Engine/modifiers/miner.ts` (new)
- `src/lib/Engine/modifiers/instaLose.ts` (new)
- `src/lib/Engine/Interactor/interactor.ts`
- `tests/Engine/miner.unit.test.ts`
- `tests/Engine/builder.unit.test.ts`

## Out of scope

- E2 action menu (separate card).
- Full game-over screen (D2).

## Notes for the coder

- The terrain transition uses `terrain.type` indices. Look them up by `name` once at module load to avoid magic numbers.
- Builder uses BuildMenu from C3 — don't duplicate the menu logic; parameterize the spawn-tile policy.
