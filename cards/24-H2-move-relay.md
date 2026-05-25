---
id: H2
epic: H - Multiplayer
title: Authoritative move relay (KV-backed REST polling MVP)
depends_on: [H1]
---

# H2 — Authoritative move relay (KV-backed REST polling MVP)

## Why this card exists

[`PUBLIC_SOCKET_CONNECTION`](../src/lib/Components/Socket/GameSocket.svelte) points at no server in this repo. Hot-seat works through `LocalInteracter` but two browsers can't play each other.

## Scope (MVP — no WS server)

- Replace the websocket assumption with REST polling backed by Vercel KV:
    - `POST /api/game/:session/move` — body: `{ event: SerializedAction }`. Server validates it's the sender's turn (compare game state in KV) and appends to the move log.
    - `GET /api/game/:session/events?since=:eventId` — returns events newer than `since`.
- `GameSocket.svelte` polls every 1-2 seconds; on new events, dispatches them through the existing interactor.
- An action's authoritative effect happens on the server's KV state (which is updated when a move is accepted) — clients render from their local game state but trust the server's accepted log.

## Acceptance criteria

- [ ] User A and User B in the same session see each other's moves within ~2 seconds.
- [ ] Attempting to act on the opponent's turn returns 403 and the client snaps back.
- [ ] If the page is refreshed mid-game, the client replays all events to current state.
- [ ] Hot-seat (single browser) still works when no opponent is in the session.

## Files likely to change

- `src/routes/api/game/[session]/move/+server.ts` (new)
- `src/routes/api/game/[session]/events/+server.ts` (new)
- `src/lib/Components/Socket/GameSocket.svelte` (swap to polling)
- `src/lib/Engine/Interactor/interactor.ts` (serialize actions, accept replayed events)

## Out of scope

- True websocket server. KV-poll MVP is fine.
- Move history replay UI (H3).

## Notes for the coder

- This is intentionally a lo-fi network layer. Functional > clever. We can swap to WS later without rewriting clients.
- Server-side game state can be a JSON snapshot per session in KV. Recomputed from event log on each POST is also fine if the log is short.
