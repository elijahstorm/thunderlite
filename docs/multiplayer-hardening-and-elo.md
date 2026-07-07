# Multiplayer Hardening & Ranked ELO — Plan

> Status: **planning only** — nothing here is implemented yet. This documents the
> current trust model, a phased path to hardening it against cheating, and how a
> trustworthy ELO ladder sits on top of that work.

## Context

ThunderLite's online (H2) multiplayer is a **client-authoritative simulation over a
shared event log**. Each client runs the full engine ([applyAction](../src/lib/Engine/applyAction.ts))
against the same ordered list of actions; the server is a thin coordinator, not a
simulator:

- [move endpoint](../src/routes/api/game/[session]/move/+server.ts) records an action after checking only
  **membership** and **whose turn it is** (`current_turn`), plus (as of the recent fix)
  attributing surrenders to the sender's own team.
- [play/+page.server.ts](../src/routes/(app)/play/+page.server.ts) ships the **entire map** (`mapHash`) and the
  full event log to every client. Fog of war and stealth/concealment are **client-side
  render filters**, not server-enforced.
- Results persist via [recordMatch](../src/lib/Database/recordMatch.ts) → the session `result` endpoint,
  which writes `match_players` rows. Outcomes are taken from the **client's reported
  winner**.

### What is already protected (server-authoritative)
Identity/seat/team, turn order, resign attribution, realtime channel access (scoped
tokens; API key never reaches the browser), and presence-based timeout/auto-resign.

### What is NOT protected (the cheat surface)
1. **Full state is in the browser.** Dev tools reveal hidden enemy units, positions, and
   telegraphed spawns — fog is cosmetic client-side.
2. **No move-legality validation.** A modified client can relay illegal actions (bad
   reach/target, free money/units); honest clients apply whatever `applyAction` accepts.
3. **No state reconciliation.** Sync trusts deterministic replay; no server board, no
   cross-client integrity check.

### Existing scaffolding we can build ELO on
- [`matches`](../src/lib/Migrations/create_matches.sql.ts) — one row per completed match, `session_id`
  **unique** (idempotent re-POST), `mode`, `winner_team`, `turns`.
- [`match_players`](../src/lib/Migrations/create_match_players.sql.ts) — `(match_id, user_auth)` unique,
  `team`, `outcome` (`win`/`loss`/`draw`).
- [`user_stats`](../src/lib/Migrations/create_user_stats.sql.ts) — already has an **`elo int` column that is
  currently unused** (profile stats are computed from `match_players` via
  [computeStats](../src/lib/Database/getUserStats.ts) + [progression](../src/lib/progression.ts)).

---

## Part A — Hardening (phased)

Each phase is independently shippable and strictly increases trust. Do them in order;
ranked ELO (Part B) should gate on reaching at least Phase 2–3.

### Phase 1 — Per-turn state-hash reconciliation (cheapest deterrent)
**What:** After each `end-turn`, every client computes a deterministic hash of its engine
state (units, HP, money, ownership, turn/team) and sends it with the relayed action. The
server stores the hash per (session, seq) and compares hashes from different clients for
the same point in the log. A mismatch = tampering or desync → flag the match (log it,
optionally freeze/void it).
- **Files:** hash helper in `src/lib/Engine/` (canonical serialize + hash); include hash in
  the [move endpoint](../src/routes/api/game/[session]/move/+server.ts) payload; store on `game_event` (new
  `state_hash` column) and compare against other members' hashes.
- **Stops:** state divergence, most naive `applyAction`-bypassing tampering, and provides
  an audit signal.
- **Does NOT stop:** the dev-tools information leak, or a cheater who tampers *and* fixes
  their hash (they'd still desync honest clients).
- **Effort:** low. **Risk:** low (additive).

### Phase 2 — Server-side action legality validation
**What:** The server keeps enough authoritative state to reject illegal actions before
appending them. Start with the cheap, high-value checks (funds for a build, unit exists &
belongs to the acting team, target in range, tile occupancy), then expand toward full rule
coverage.
- **Files:** run a headless slice of the engine server-side keyed off `mapHash` + replayed
  event log in the [move endpoint](../src/routes/api/game/[session]/move/+server.ts); reject on invalid.
- **Stops:** resource/teleport/illegal-move cheats.
- **Effort:** medium–high (engine must run server-side; `deriveFromHash` +
  `derivePlayersFromMap` already do on the server, so the engine is largely isomorphic).

### Phase 3 — Server-side fog (closes dev-tools peeking)
**What:** The server computes each recipient's visibility and sends only what their team can
legally see — filtered initial state **and** filtered per-event deltas — instead of the full
`mapHash` + full log. Hidden enemy units simply aren't in the client's data.
- **Files:** move visibility ([src/lib/Engine/visibility.ts](../src/lib/Engine/visibility.ts)) to a
  server path; per-recipient event projection in the events/realtime push.
- **Stops:** the information cheat you asked about (dev-tools map reveal, stealth reveal,
  spawn telegraph peeking).
- **Effort:** high; depends on Phase 2's server-side engine. Biggest correctness surface
  (fog must exactly match what the client would have derived).

### Phase 4 — Fully server-authoritative simulation (end state)
Server holds the one true board; clients send intents and render server-confirmed state.
Subsumes Phases 2–3. Largest rewrite; only worth it if competitive integrity demands it.

**Recommended stopping point for most needs:** Phase 1 + Phase 2 make outcomes trustworthy
enough for ranked; Phase 3 additionally kills information cheats.

---

## Part B — Ranked ELO

**Hard dependency:** ELO is only as meaningful as the match outcome. Ranked ratings should
not go live until outcomes are trustworthy — i.e. **gate ranked mode on Phase 2** (legality
validation) at minimum, ideally Phase 3. Until then we can compute/display ELO for *casual*
play as a non-authoritative number, clearly labelled.

### Rating model
- **Algorithm:** standard **Elo** first (simple, well-understood): `expected = 1/(1+10^((Rb-Ra)/400))`,
  `Rnew = R + K*(score - expected)`. Recommend **Glicko-2** later for intermittent players
  (accounts for rating uncertainty/inactivity) — same integration points.
- **Seed:** 1000 (or 1200). **K-factor:** higher while provisional (e.g. K=40 for first ~10
  rated games), then K=20, K=10 above a threshold.
- **Draws:** score 0.5 each. **Leaver/timeout:** the auto-resign path already produces a
  server-authored surrender → counts as a loss for the abandoner.

### Where it's computed (server-side, once, idempotent)
Compute at **match finalization in the [result endpoint](../src/routes/api/game/[session]/result/+server.ts)**:
- `matches.session_id` is unique, so the first authoritative write is the natural once-only
  hook. At that point the server knows the winner and can resolve both participants' auths
  from the room roster and their current ELOs.
- Load both `user_stats.elo` (seed if null), compute deltas from the outcome, and update
  both rows atomically. Never trust a client-sent rating.

### Data model additions
- Reuse **`user_stats.elo`** (already present); default/seed on first rated game.
- Add rating provenance so history/leaderboards and disputes are possible:
  - `match_players.elo_before` / `elo_after` (per-match snapshot), and/or
  - a `rating_history(user_auth, match_id, elo, delta, created_at)` table.
- Add `matches.ranked boolean` (and a lobby `ranked` flag on `game_room`) so only ranked
  matches move ELO.

### Ranked eligibility & anti-abuse
- **Humans only:** a match with an AI seat (`game_member.is_ai`) is never ranked.
- **Two distinct accounts**, minimum turn count (ignore instant/empty games), and a guard
  against rematch farming (cap rating gain between the same pair per window, or don't rate
  repeat rematches).
- Abandon = loss (already covered by heartbeat/sweep auto-resign).

### UI
- Show ELO + rank tier on `/me` and public profiles (extend
  [getUserStats](../src/lib/Database/getUserStats.ts) / StatsPanel).
- A paginated **leaderboard** page (mirror the `/rooms` list pattern).
- Lobby: a **Ranked** toggle (host), surfaced alongside the seat-selection UI.

---

## Recommended sequencing
1. **Phase 1** (state-hash) — cheap integrity signal, ship first.
2. **Casual ELO plumbing** — compute + store + display ratings as *unranked* (validates the
   Part B integration end-to-end with low stakes).
3. **Phase 2** (server legality) — then flip on **Ranked** mode + rated ELO.
4. **Phase 3** (server fog) — closes information cheats for competitive play.
5. **Glicko-2 / decay / seasons** — refinements once ranked is live.

## Open decisions (need Elijah's call before building)
- Elo vs Glicko-2 to start; seed rating and K-factor schedule.
- Which hardening phase must land before **Ranked** is allowed (recommend Phase 2).
- Rate AI games at all? (recommend no.)
- Leaderboard scope (global only, or friends/seasonal too) and rank-tier names.
- Rating decay for inactivity? Seasons/resets?
