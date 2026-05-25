---
id: B1
epic: B - Combat realism
title: Armor/weapon damage formula with HP scaling and terrain defense
depends_on: [A1]
---

# B1 — Armor/weapon damage formula with HP scaling and terrain defense

## Why this card exists

[`interactor.ts:79-89`](../src/lib/Engine/Interactor/interactor.ts) currently does `target.health -= attacker.power`. That ignores armor matchups, terrain defense, and the attacker's current HP — all core to Battalion: Arena's tactics.

## Scope

Add a pure damage module:

- New `src/lib/Engine/combat.ts` exporting `calculateDamage(attacker, defender, ctx) => number`.
- Formula:

  ```
  baseDamage      = attacker.power * (attacker.health / attackerMaxHealth)
  matchupBonus    = (attacker.weaponType === defender.armorType) ? 1.5 : 1.0
  terrainGuard    = 1 - defender.terrainProtection      // from terrainData[defender.tile.ground].protection
  finalDamage     = round(baseDamage * matchupBonus * terrainGuard)
  ```
- Replace the inline damage math in `interactor.ts → attack` with a call to `calculateDamage`. Round to an integer. Never go negative.
- Add a damage-preview function exported from the same module — `previewDamage(attacker, defender, ctx)` — for future HUD use, identical implementation.

## Acceptance criteria

- [ ] `calculateDamage` is pure (no Svelte imports, no globals) and accepts a `ctx` containing the map for terrain lookup.
- [ ] Heavy Commando (weapon=heavy) attacking Strike Commando (armor=light) deals **less** damage than a same-class matchup. Strike Commando into another Strike Commando (light v light) deals 1.5× base.
- [ ] A wounded Annihilator at 70/140 HP deals exactly half of a full-HP Annihilator's damage.
- [ ] A unit on Mountain (`protection: 0.4`) takes 40% less damage than the same unit on Road.
- [ ] Damage is always an integer ≥ 0.
- [ ] Vitest covers: matchup multiplier, HP scaling, terrain reduction, zero floor, integer output.
- [ ] In-game: attacks visibly do plausible damage; counter-attack still happens but uses the same formula (full Counter rules land in B2).

## Files likely to change

- `src/lib/Engine/combat.ts` (new)
- `src/lib/Engine/Interactor/interactor.ts`
- `tests/Engine/combat.unit.test.ts` (new)

## Out of scope

- Counter-attack rules / Stun / Flak / Fast/Slow attack mods (B2).
- Terrain damage on rest (B3).
- Air sight modifiers like Hills' `Extra_Sight` (F1).

## Notes for the coder

- Wiki spec is informal — "same class hits at ~1.5×". Use exactly 1.5. Don't overengineer with a matrix unless a later card asks.
- HP scaling: in the original engine the attacker's current HP relative to max determines power. Defender HP doesn't factor into damage *dealt to defender*.
- `unitData[i].health` is the max HP; the live HP is on `UnitObject.health` (optional, defaults to max).
