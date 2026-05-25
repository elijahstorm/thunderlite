---
id: G1
epic: G - Special unit abilities
title: Vulture — move again on kill
depends_on: [B1]
---

# G1 — Vulture — move again on kill

## Why this card exists

The Vulture Drone declares `End_Turn.Vulture`. Original semantics ([`old/modifiers.js`](../src/lib/GameData/old/modifiers.js)): if the Vulture kills its target, it gets a second action this turn.

## Scope

- Track per-attack outcome on each Vulture action: was the target killed by this attack?
- If yes, immediately remove the Vulture's tile from `actedTiles` (re-enables selection for this turn).
- If no, normal behavior (acted, can't move again).

## Acceptance criteria

- [ ] Vulture Drone kills target → can be selected and moved/attacked again this turn.
- [ ] If attack damages but doesn't kill, Vulture ends turn normally.
- [ ] Re-action is one-shot: chaining kills doesn't grant a third action (the second action follows normal rules).
- [ ] Vitest covers both branches.

## Files likely to change

- `src/lib/Engine/modifiers/vulture.ts` (new)
- `src/lib/Engine/Interactor/interactor.ts` (call the handler after attack resolves)
- `tests/Engine/vulture.unit.test.ts`

## Notes for the coder

- The cleanest place to fire this is right after `reduceHealth` returns `targetDied === true` in the attack flow.
