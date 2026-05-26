---
id: H1
epic: H - Multiplayer
title: Second-player join flow
depends_on: [D1]
---

# H1 — Second-player join flow

## Why this card exists

[`/api/game/+server.ts`](../src/routes/api/game/+server.ts) creates a session and stores the creator in KV under `game:${session}` — but no endpoint exists for a second user to join. Right now a friend can't get into the same session.

## Scope

- New endpoint `POST /api/game/join` accepting `{ session }`. It:
  1. Verifies the session exists (KV `game:${session}` is a non-empty set).
  2. Verifies room isn't full (max 2 for now).
  3. Adds the joining user to the set; writes `user-game:${joiner}` = `{ session, sha }`.
- UI on `/rooms`: a small "Join a game" form taking a session code. On submit, POST `/api/game/join`, then `goto('/play')`.
- The creator's `/rooms` page should display the active session code so they can share it.

## Acceptance criteria

- [ ] User A creates a game via `/make` → sees the session code in `/rooms`.
- [ ] User B pastes that code in `/rooms`, joins, and `/play` loads with the same map.
- [ ] Joining a non-existent or full session returns a 4xx with a clear error.
- [ ] No regression for the single-user path.

## Files likely to change

- `src/routes/api/game/join/+server.ts` (new)
- `src/routes/(app)/rooms/+page.svelte`
- `src/routes/(app)/rooms/+page.server.ts`

## Out of scope

- Authoritative move arbitration (H2).
- Persistent move history (H3).
- Matchmaking.

## Notes for the coder

- Reuse the `createClient` KV pattern already in the codebase.
- The session code is the value of `gameSession` already stored by the game-creation flow.
