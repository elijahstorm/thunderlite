---
id: I2
epic: I - Audio
title: Music director keyed to game phase
depends_on: [I1, A2, D1]
---

# I2 — Music director keyed to game phase

## Why this card exists

The original game swapped music by game phase: intro on load, one theme on your turn, another on the opponent's, "thinking" while the AI computed, a hurry-warning loop on inactivity, and one-shot win/lose stings. The matching tracks already exist under `static/game/sounds/music/game/`. The engine exposes everything needed: [`gameState.ts`](../src/lib/Engine/gameState.ts) has `phase`, `currentTeam`, and `winner`; [`turnLoop.ts`](../src/lib/Engine/turnLoop.ts) drives turn transitions; [`winConditions.ts`](../src/lib/Engine/winConditions.ts) reports terminal results.

## Scope

- `src/lib/Audio/musicDirector.ts` exposing a pure `musicForState(state, localTeam) → trackId | null` plus a thin subscription wrapper that calls `playMusic` (from I1) on change.
- Phase mapping:
  - game start → `game/intro` then settle into the turn theme
  - active team is the local human → `game/player`
  - active team is an opponent → `game/enemy` (use `game/ally` for a non-local allied team when teams > 2)
  - CPU is computing its turn (`cpuAi` running) → `game/thinking`
  - inactivity / hurry timer fires → `game/inactive`
  - terminal win → `game/win`; terminal loss → `game/lose` (both non-looping)
- Subscribe to turn transitions and the win-condition result; drive the `music` channel only.

## Acceptance criteria

- [ ] Local player's turn loops `game/player`; opponent's turn loops `game/enemy`.
- [ ] Game over: the winner hears `game/win`, the loser hears `game/lose`, neither loops.
- [ ] A CPU turn plays `game/thinking` until the CPU acts, then returns to the turn theme.
- [ ] Rapid turn changes never overlap two tracks.
- [ ] Vitest: `musicForState` covers every phase branch including the teams>2 ally case.

## Files likely to change

- `src/lib/Audio/musicDirector.ts` (new)
- `src/lib/Engine/turnLoop.ts` (expose a phase-change signal the director can subscribe to, if not already observable)
- `src/lib/Engine/Game.svelte` (own the director's lifecycle)
- `tests/Audio/musicDirector.unit.test.ts`

## Out of scope

- Action SFX and weather audio (I3).
- Editor music (`music/editor/*`) — fold into the editor route separately if wanted.

## Notes for the coder

- Keep `musicForState` pure and exhaustively tested; the side-effecting subscription is a thin shell over it.
- The hurry-warning (`game/inactive`) depends on an inactivity timeout. If the H-series move relay doesn't expose one yet, gate that branch behind a flag and leave a TODO referencing H2 — don't invent a timer here.
