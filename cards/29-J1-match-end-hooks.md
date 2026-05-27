---
id: J1
epic: J - Match-end hooks & stats
title: Match-end hook system (single result event, many subscribers)
depends_on: [D1]
---

# J1 — Match-end hook system

## Why this card exists

[`winConditions.ts`](../src/lib/Engine/winConditions.ts) detects a terminal state and [`GameOverModal.svelte`](../src/lib/Engine/HUD/GameOverModal.svelte) shows it, but nothing else can react. We want one well-defined moment — "this match ended" — that many independent features subscribe to: the stats screen (J2), result persistence (J3), campaign unlocks (K3), and eventual PvP elo. This card builds that hook so winner/loser-driven behavior fires from a single source of truth.

## Scope

- `src/lib/Engine/matchEnd.ts` defining a typed result and a subscriber registry:
  ```ts
  type MatchOutcome = 'win' | 'loss' | 'draw'
  type MatchPlayer = {
  	team: number
  	userAuth?: string
  	outcome: MatchOutcome
  	isLocal: boolean
  	isCpu: boolean
  }
  type MatchResult = {
  	mode: 'campaign' | 'hotseat' | 'online'
  	sessionId?: string        // online (H2)
  	mapSha?: string
  	campaignLevelId?: string   // campaign (K)
  	winner: number | null      // winning team index, null = draw
  	players: MatchPlayer[]
  	turns: number
  	endedAt: number
  	stats?: PerPlayerStats[]    // populated by J2's tracker if present
  }
  onMatchEnd(handler: (r: MatchResult) => void): () => void   // returns unsubscribe
  emitMatchEnd(result: MatchResult): void                      // idempotent per match
  ```
- Wire [`Game.svelte`](../src/lib/Engine/Game.svelte) to build a `MatchResult` from final game state and call `emitMatchEnd` exactly once when `applyWinConditions` returns terminal.
- Emission is idempotent: a given match fires `emitMatchEnd` at most once even if win conditions re-evaluate.

## Acceptance criteria

- [ ] Reaching a terminal win state fires `emitMatchEnd` once with the correct `winner`, per-player `outcome`, `mode`, and `turns`.
- [ ] Two registered handlers both receive the same result; unsubscribing one stops only that one.
- [ ] Re-evaluating win conditions after the match ended does not fire a second event.
- [ ] Draw (no team can win) emits `winner: null` and every player `outcome: 'draw'`.
- [ ] Vitest: register spies, drive a fake terminal state, assert single dispatch + payload shape.

## Files likely to change

- `src/lib/Engine/matchEnd.ts` (new)
- `src/lib/Engine/Game.svelte` (build + emit result on terminal)
- `tests/Engine/matchEnd.unit.test.ts`

## Out of scope

- What subscribers do (stats J2, persistence J3, unlocks K3, elo later).
- Per-player stat collection (J2 owns the tracker; this card just carries `stats?` through).

## Notes for the coder

- This is the spine the user explicitly asked for: "hooks that go into the winner and loser so level unlocks and eventual PvP elo can fire." Keep `MatchResult` mode-agnostic so campaign, hotseat, and online all flow through the same event.
- Derive the winner from the engine's authoritative state, not from any UI claim.
