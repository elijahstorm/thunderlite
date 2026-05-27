---
id: J2
epic: J - Match-end hooks & stats
title: End-game stats screen
depends_on: [J1, D2]
---

# J2 — End-game stats screen

## Why this card exists

[`GameOverModal.svelte`](../src/lib/Engine/HUD/GameOverModal.svelte) currently just says who won. The user wants a proper end-game stats screen that summarizes the match and provides the forward action (rematch, exit, or — in campaign — continue). It also fills in the `stats` field on the `MatchResult` from J1.

## Scope

- A lightweight per-player stat tracker `src/lib/Engine/matchStats.ts` that accumulates during play: `unitsBuilt`, `unitsLost`, `damageDealt`, `tilesCaptured`, `turnsTaken`. Fed by observing resolved actions in [`applyAction.ts`](../src/lib/Engine/applyAction.ts) (live actions only — skip replay, same rule as I3).
- Populate `MatchResult.stats` before/at `emitMatchEnd` (J1).
- Replace the bare game-over modal with `src/lib/Engine/HUD/StatsScreen.svelte`: winner banner, a per-player stats table, and context-appropriate buttons:
  - online/hotseat → **Rematch** / **Exit to rooms**
  - campaign → **Continue** (advances per K4) / **Exit to campaign**
- The screen reads the `MatchResult`; it does not compute outcome itself.

## Acceptance criteria

- [ ] Finishing a match shows the stats screen with each player's units built/lost, damage dealt, captures, and turns.
- [ ] Winner is visually distinguished from loser(s); a draw reads as a draw.
- [ ] In campaign mode the screen shows **Continue**; in online/hotseat it shows **Rematch / Exit**.
- [ ] Stat counters ignore replayed actions on reconnect (no double-count).
- [ ] Vitest: `accumulate(stats, action)` pure-tested for build/loss/damage/capture.

## Files likely to change

- `src/lib/Engine/matchStats.ts` (new)
- `src/lib/Engine/HUD/StatsScreen.svelte` (new — supersedes GameOverModal usage)
- `src/lib/Engine/applyAction.ts` (feed the tracker on live actions)
- `tests/Engine/matchStats.unit.test.ts`

## Out of scope

- Persisting stats to the DB (J3).
- Fancy charts. A plain table is fine; the user will style later.

## Notes for the coder

- Keep stat accumulation pure (`accumulate(stats, action) → stats`) so it's testable and so the same function can run server-side later if needed.
- The **Continue** button's destination comes from K4; until K4 lands, wire it to a no-op/route stub and leave a TODO referencing K4.
