---
id: K2
epic: K - Single-player campaign
title: Campaign runner — drive the engine from a parsed script
depends_on: [K1, A2, E2]
---

# K2 — Campaign runner

## Why this card exists

K1 parses scripts into events. Something must execute them against a live game: move the camera, show dialogue, run scripted spawns/kills/terrain changes, and pause for `wait`. This is the layer that turns a parsed script into a playable scripted level.

## Scope

- `src/lib/Campaign/campaignRunner.ts`: consume a parsed script (K1) and drive an interface object:
  - `camera` → pan via [`Scroller`](../src/lib/Scroller/Scroller.ts)
  - `highlight` / `unhighlight` → reuse the engine's tile-highlight mechanism
  - `talk` → push lines to a dialogue overlay, advance on click/tap
  - `spawn` / `kill` / `setTerrain` → apply through the engine's action/mutation path
  - `wait` → timed pause
- Run the `start` block on level load; the matching `turns[n]` block at the start of turn _n_; and `win` / `lose` blocks driven off the J1 match-end result.
- Dialogue overlay component `src/lib/Campaign/Dialogue.svelte` (speaker + text, click to advance, skippable).
- Between scripted events the player keeps normal control — this is a tutorial/story layer on top of a real match.

## Acceptance criteria

- [ ] Loading a scripted level plays its `start` block: camera moves, dialogue advances on click, scripted units appear.
- [ ] A `<turn 2>` block fires at the start of turn 2.
- [ ] Winning plays the `win` block; losing plays the `lose` block.
- [ ] Vitest: the runner drives a **headless fake interface** through a full script and calls the expected engine ops in order (mirror the engine's existing headless-in-vitest pattern).

## Files likely to change

- `src/lib/Campaign/campaignRunner.ts` (new)
- `src/lib/Campaign/Dialogue.svelte` (new)
- `src/lib/Engine/Game.svelte` (mount the runner when a campaign level is active)
- `tests/Campaign/campaignRunner.unit.test.ts`

## Out of scope

- Progression / unlocks (K3) and the mode shell/UI (K4).
- The level content itself (K5).

## Notes for the coder

- Drive an injected interface so the runner runs headless in vitest, per the mission's "game-logic modules must run headless" rule.
- Reuse `applyAction`/mutation paths for `spawn`/`kill`/`setTerrain` rather than mutating state directly, so scripted changes flow through the same validation as player actions.
