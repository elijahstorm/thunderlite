---
id: B2
epic: B - Combat realism
title: Counter-attack rules and offensive/defensive damage modifiers
depends_on: [B1, A3]
---

# B2 — Counter-attack rules and offensive/defensive damage modifiers

## Why this card exists

Counter-attacks in [`interactor.ts:90-102`](../src/lib/Engine/Interactor/interactor.ts) fire even when the defender shouldn't be able to reach back. Modifiers like `Attack.Stun`, `Damage.Fast_Attack`, `Damage.Slow_Attack`, `Damage.Flak`, and the `Can_Attack.*` gating are all declared on units and ignored.

## Scope

Implement the full counter-attack rule and wire combat modifiers through the A3 dispatcher:

- `canCounterAttack(attacker, defender, ctx) → boolean` in `combat.ts`:
    - defender must be alive after primary hit
    - defender's range must include the attacker's stand-tile (use `generateAttackList` from `Pathing/attack.ts`)
    - attacker must not be `Attack.Stun`-flagged for this exchange
    - defender's `Can_Attack.*` gates must accept the attacker's type (e.g. ground unit cannot counter air without `Air_Raid`)
- New phase in the modifier registry: `'Damage.Attack'` and `'Damage.Counter'`. Handlers return a numeric multiplier that compounds on the damage formula:
    - `Damage.Fast_Attack` → 1.2 when the unit is the **attacker** of this exchange.
    - `Damage.Slow_Attack` → 0.85 when the unit is the **defender** (i.e. countering).
    - `Damage.Flak` → 2.0 when the **defender** has `armorType === 'light'`.
- `Attack.Stun` declares an effect on the defender for the rest of this exchange (no counter-attack). The flag does not persist past the exchange.
- `Can_Attack.Air_Raid` → permits attacking units of `type === 'air'`. Without it, ground/sea units cannot select or counter air.
- `Can_Attack.Bombard` → permits attacking sea units from non-sea.
- `Can_Attack.Ground_Assult` → sea units can attack ground.
- `Can_Attack.Counter_Range` → ranged units can counter when struck by a ranged attacker (default rule is that ranged units *don't* counter melee, see notes).

## Acceptance criteria

- [ ] Mortar Truck (range 2-3) attacked by Strike Commando (melee at adjacent tile): no counter (it can't shoot adjacent unless `Counter_Range` rules apply; mortar's range starts at 2).
- [ ] Spider Tank (Stun) attacks Scorpion Tank → no counter happens.
- [ ] Flak Tank attacks Raptor Fighter → primary hit lands, 2× multiplier applies.
- [ ] Strike Commando cannot select Raptor Fighter as an attack target.
- [ ] Vitest covers all four `Can_Attack.*` gates and the three damage multipliers (Flak, Fast, Slow).
- [ ] No regression in the basic attack flow.

## Files likely to change

- `src/lib/Engine/combat.ts`
- `src/lib/Engine/modifiers/damageMultipliers.ts` (new)
- `src/lib/Engine/modifiers/canAttack.ts` (new)
- `src/lib/Engine/Interactor/interactor.ts`
- `src/lib/Engine/Interactor/Pathing/attack.ts` (filter targets by `Can_Attack.*`)
- `tests/Engine/combat.unit.test.ts`

## Out of scope

- Lance attack passthrough (G2).
- Cloak/stealth target hiding (F2).

## Notes for the coder

- Look at [`src/lib/GameData/old/modifiers.js`](../src/lib/GameData/old/modifiers.js) lines marked `Damage.Flak`, `Damage.Fast_Attack`, `Damage.Slow_Attack` — the original semantics are tiny and clear. Port them precisely.
- "Counter range" interpretation: only ranged units with `Counter_Range` mod can counter another ranged unit at the same range. Mortar Truck and Rocket Truck both have it. They still cannot counter a melee attacker that landed adjacent to them.
- Keep `canCounterAttack` pure. Tests should exercise it without spinning up Svelte.
