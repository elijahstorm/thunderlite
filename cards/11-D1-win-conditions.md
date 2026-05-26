---
id: D1
epic: D - Win conditions
title: Win-check engine
depends_on: [C2, C4]
---

# D1 — Win-check engine

## Why this card exists

Capture and Warmachine death have triggers but nothing closes the loop into a game-over state.

## Scope

- New `src/lib/Engine/winConditions.ts` exporting `evaluateWinConditions(state) → { gameOver: boolean, winner?: number, losers: number[] }`.
- Conditions:
  1. **Command Center captured**: handled by `Capture.Insta_Lose` — set `player.hasLost = true` for the previous owner of the Command Center.
  2. **Last-team-standing**: if exactly one player has `hasLost === false`, that's the winner.
  3. **No units AND no Command Center**: a player with zero units and zero Command Centers is set to `hasLost = true` (this catches the "Blitz Warmachine dies" path even if D1's evaluation runs before C4's handler).
- Run `evaluateWinConditions` after every action that could change unit/building counts (move, attack, capture, build, mine) AND at start-of-turn.
- On `gameOver`, set `state.phase = 'gameOver'` and `state.winner`.

## Acceptance criteria

- [ ] Vitest: 3-player setup where player 1 loses both Command Centers → `hasLost[0] = true`; if only player 2 is left, `winner = 2`.
- [ ] Triggering capture-insta-lose ends the game; the HUD freezes (`endTurn` no-ops, unit selection no-ops while `phase === 'gameOver'`).
- [ ] No regressions in pre-end-state gameplay.

## Files likely to change

- `src/lib/Engine/winConditions.ts` (new)
- `src/lib/Engine/modifiers/captureInstaLose.ts` (new)
- `src/lib/Engine/modifiers/index.ts`
- `src/lib/Engine/turnLoop.ts` (call evaluator)
- `src/lib/Engine/Interactor/interactor.ts` (call evaluator)
- `tests/Engine/winConditions.unit.test.ts`

## Out of scope

- The visual game-over modal (D2).

## Notes for the coder

- Keep the evaluator pure. Side effects (setting `state.phase`) happen at the call site in the orchestrating layer (interactor / turnLoop).
- Test for double-trigger safety: calling `evaluateWinConditions` twice in a row produces identical results.
