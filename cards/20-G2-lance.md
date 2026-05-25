---
id: G2
epic: G - Special unit abilities
title: Lance — attack passes through to the tile behind the target
depends_on: [B1]
---

# G2 — Lance — attack passes through to the tile behind the target

## Why this card exists

Lance Tank has `Attack.Lance` declared. Original behavior: when it attacks an adjacent enemy, it also damages the tile directly behind that enemy (relative to the lance tank's facing).

## Scope

- After the primary hit resolves, compute the tile behind the target relative to the attacker: `behindTile = targetTile + (targetTile - attackerTile)`.
- If a unit is on `behindTile`, apply the same damage formula (no counter from the passthrough).
- Visual: reuse the existing attack animation. No new asset needed.

## Acceptance criteria

- [ ] Lance Tank attacks unit at (x+1, y) → unit at (x+2, y) also takes damage.
- [ ] The passthrough target does not counter-attack.
- [ ] If `behindTile` is off-map or empty, nothing happens.
- [ ] Vitest covers passthrough geometry.

## Files likely to change

- `src/lib/Engine/modifiers/lance.ts` (new)
- `src/lib/Engine/Interactor/interactor.ts` (call after primary attack resolves)
- `tests/Engine/lance.unit.test.ts`

## Notes for the coder

- "Behind" assumes a 4-directional adjacency. The lance is melee-only (range 1-1) so direction is unambiguous: `delta = targetTile - attackerTile`.
- Don't recursively apply the lance: the passthrough hit does not trigger another lance check.
