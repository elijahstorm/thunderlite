---
id: A3
epic: A - Core turn loop
title: Modifier dispatcher — wire registry to real handlers
depends_on: [A2]
---

# A3 — Modifier dispatcher — wire registry to real handlers

## Why this card exists

Today [`src/lib/Engine/GameData/modifier.ts`](../src/lib/GameData/modifier.ts) maps every modifier key to an empty string. Unit and building declarations reference these keys (e.g. `Start_Turn.Capture`, `Each_Turn.Supply_Income`, `Capture.Insta_Lose`), but nothing happens when they fire. The original Flash game's behaviors live in [`src/lib/GameData/old/modifiers.js`](../src/lib/GameData/old/modifiers.js) — port the semantics.

## Scope

Convert the registry seam from A2 into a real, typed dispatcher and **port these specific modifiers** (the rest land in their own cards):

| Modifier key                   | Behavior to port                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `Start_Turn.Capture`           | Skip — landing in C2.                                                             |
| `Each_Turn.Supply_Income`      | Skip — landing in C1.                                                             |
| `Capture.Insta_Lose`           | Skip — landing in D1.                                                             |
| `Capture.Allow_Ground/Air/Sea` | Skip — landing in C2/C3.                                                          |
| `Start_Turn.Heal_Team`         | Heal every friendly unit standing on the Command Center by `+10 HP` (cap at max). |
| **All others**                 | Register as a typed no-op for now (so the dispatcher won't throw on lookup).      |

The **deliverable here is the _dispatcher shape_, not all 30 modifiers**. A3 just makes the registry production-shaped: typed key, typed phase, typed context, typed handler. Subsequent cards (B/C/F/G) drop handlers into this registry without changing call sites.

Change `modifier.ts` so each key resolves to an object:

```ts
{ phase: 'Start_Turn' | 'End_Turn' | 'Each_Turn' | 'Capture' | 'Move' | 'Idle' | 'Self_Action' | 'Can_Attack' | 'Damage' | 'Attack' | 'Death' | 'Properties', run?: ModifierHandler }
```

## Acceptance criteria

- [ ] `src/lib/Engine/modifiers/index.ts` exports `runModifiers(target, phase, ctx)` that:
  - filters the target's declared modifiers by phase
  - calls each handler in declared order
  - safely no-ops if a handler is missing
- [ ] Modifier handler signature is typed: `(ctx: { target, map, players, getPlayer, ... }) => void`.
- [ ] At least one real handler (`Start_Turn.Heal_Team`) is wired and unit-tested: starting your turn with a wounded friendly unit on a Command Center heals it by 10 (or to max).
- [ ] Vitest covers: dispatcher correctly filters by phase, handlers run in declaration order, missing handlers don't throw.
- [ ] No regressions; `GameStateManager` still runs.

## Files likely to change

- `src/lib/GameData/modifier.ts` (replace empty-string map with typed records)
- `src/lib/Engine/modifiers/index.ts`
- `src/lib/Engine/modifiers/healTeam.ts` (new)
- `tests/Engine/modifiers.unit.test.ts` (new)

## Out of scope

- Capture (C2), income (C1), all combat modifiers (B2), cloak/radar/jammer (F2), Lance/Stun/Vulture/Repair (G).

## Notes for the coder

- Resist the temptation to port everything from `old/modifiers.js` at once. The contract here is the registry shape and ONE example. Other cards depend on the dispatcher being stable.
- Treat the `ctx` object as a plain TypeScript interface — no Svelte imports in the handlers.
- The existing `unitData[].modifiers: (keyof typeof modifierData)[]` strings must keep working. Don't rename modifier keys.
