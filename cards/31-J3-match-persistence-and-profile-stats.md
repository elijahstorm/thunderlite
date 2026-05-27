---
id: J3
epic: J - Match-end hooks & stats
title: Persist match results and surface profile stats
depends_on: [J1, H2]
---

# J3 — Persist match results and surface profile stats

## Why this card exists

The original game tracked `totalGames` and `gamesWon` per user. The new `users` table (see [`getUserData.ts`](../src/lib/Database/getUserData.ts)) has no game stats and no match history. This card adds a `onMatchEnd` (J1) subscriber that writes results, plus a profile stats panel.

## Scope

- Migration under `src/lib/Migrations/`: `matches` (id, map_sha, mode, winner_team, turns, started_at, ended_at) and `match_players` (match_id, user_auth, team, outcome).
- A J1 subscriber `src/lib/Database/recordMatch.ts` that, for online matches (`sessionId` present), POSTs to a new `/api/game/[session]/result` endpoint which writes the rows. Hot-seat/campaign records the signed-in player's row only; fully anonymous play records nothing.
- Idempotent: one result row set per `sessionId`/match.
- `src/lib/Database/getUserStats.ts`: aggregate `match_players` → games, wins, losses, win-rate. Surface a stats panel on `/me` ([`me/+page.svelte`](<../src/routes/(dashboard)/me/+page.svelte>)) and the public profile.
- A pure progression module `src/lib/progression.ts` (`pointsForResult`, `levelForPoints`) so points/level mirror the old game and stay tunable. **This is also where PvP elo will live later** — leave a clearly-marked seam.

## Acceptance criteria

- [ ] Finishing an online match writes one `matches` row + one `match_players` row per participant with correct outcomes.
- [ ] Re-POSTing the same session result is a no-op (no duplicate rows).
- [ ] `/me` shows "N games, W wins, X% win-rate"; a new account shows zeros, not an error.
- [ ] Another user's public profile shows their stats.
- [ ] Vitest: `computeStats(rows)`, `pointsForResult`, `levelForPoints` pure-tested.

## Files likely to change

- `src/lib/Migrations/NNNN_matches.sql` (new)
- `src/routes/api/game/[session]/result/+server.ts` (new)
- `src/lib/Database/recordMatch.ts` (new), `src/lib/Database/getUserStats.ts` (new)
- `src/lib/progression.ts` (new)
- `src/routes/(dashboard)/me/+page.svelte` (render panel)
- `tests/...`

## Out of scope

- Full PvP elo/ranking (only the seam + simple points now).
- Leaderboards, seasons, achievements.

## Notes for the coder

- Trust the server's authoritative KV game state (H2) for the winner before writing, not the client's claim.
- `recordMatch` is just another `onMatchEnd` subscriber — it must not know about the stats screen or campaign unlocks. All three hang off J1 independently.
