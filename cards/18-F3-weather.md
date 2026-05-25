---
id: F3
epic: F - Fog of war & visibility
title: Weather effects on air units (optional / exploratory)
depends_on: [F1]
---

# F3 — Weather effects on air units (exploratory)

## Why this card exists

Sky-layer weather (Cloud, Storm) is partially modelled in [`src/lib/GameData/sky.ts`](../src/lib/GameData/sky.ts) with `hidden` and `treacherous` modifiers, but nothing applies them. Weather wasn't in the original Battalion: Arena — it's an exploratory feature.

## Scope (minimal — this card is low priority)

- `Cloud` (`modifier: hidden`): air units under a cloud are hidden from the enemy unless an enemy unit is adjacent or has radar.
- `Storm` (`modifier: hidden, treacherous`): same hiding rule plus 10 HP damage to air units that end their turn under a storm tile. Movement cost doubles (use the `drag` value already in `skyData`).

## Acceptance criteria

- [ ] Raptor Fighter under Cloud is invisible to the opposing team.
- [ ] Raptor Fighter ending its turn under Storm loses 10 HP and movement is reduced for the next turn.
- [ ] If F3 is skipped or partial, it's documented in the commit message — F3 is non-essential.

## Files likely to change

- `src/lib/Engine/visibility.ts`
- `src/lib/Engine/turnLoop.ts` (storm damage step)
- `src/lib/Engine/Interactor/Pathing/movement.ts` (storm drag for air)

## Out of scope

- Wind / weather movement across the map (the old `weather_data.js` experimented with this; ignore).
- Other weather types beyond Cloud and Storm.

## Notes for the coder

- This card is explicitly exploratory. The mission doc says: don't sink time here. If you reach end of session and have D/E/G work left to defend, leave F3 partial and clearly say so.
