# Scaling the gateway call budget to 200 parallel matches

Target: 200 concurrent live matches inside the DontCode gateway budgets as
published. The budgets are fixed from our side; thunderlite is a real-world
stress test of the DontCode product, so every answer here is fewer or cheaper
calls, never a raised limit. Measured baseline was match 24 (2026-09-02): one
match at 39% of the tightest budget, about 4 concurrent matches possible.

## The arithmetic

Budgets are per project per minute, shared by every room at once:
`db/read` 900, `db/write` 300, `cache` 1000, `realtime` 1200, `storage` 120.
At 200 matches each match gets **4.5 reads, 1.5 writes and 5 cache calls a
minute**. A match runs about 28 actions and 2.7 turns a minute, so nothing can
cost a server call per action, and even one row per turn (2.7 writes) is over.
The write unit has to be a group of turns:

| Turns per row | Turn rows/min at 200 | With ~100/min lifecycle | Share of 300 |
| --- | --- | --- | --- |
| 1 | 548 | 648 | over |
| 2 | 274 | 374 | over |
| 3 | 183 | 283 | 94% |
| 4 | 137 | 237 | 79% |

## Where things live

- Every gateway call: `src/lib/dontcode/server.ts`. Budgets and breakers:
  `src/lib/Security/rateLimit.ts`. Spend by route: `gatewayLedger.ts`, `/dev/lag`.
- Store: `src/lib/Game/store.server.ts`. Hot routes:
  `src/routes/api/game/[session]/{move,events,heartbeat,key,trace,log}/+server.ts`.
- Client sync: `src/lib/Components/Socket/GameSocket.svelte` (relay, live frames,
  provisional apply), `matchKey.ts`, `pushBuffer.ts`, `eventQueue.ts`.
- Signing: `src/lib/Security/frameSigning.ts`. Trace: `src/lib/Engine/liveLog.ts`,
  `src/lib/Game/traceArchive.ts`.
- Stress harness: `/dev/server-stress-test`, `src/lib/Dev/serverStress/`.

## What remains

1. **Sender-grouping.** When the host drives CPU seats, its own turn and the CPU
   turns are one sender's work. Hold them and seal them as one row at the
   handover to another human. No trust change. In match 24's shape that is three
   of four turns per row, near 100 matches. Does nothing for a pure 1v1.
2. **Witness-sealed groups of N.** A receiver seals a row holding other players'
   turns, carrying their frame signatures; the server verifies each turn against
   the actor's registered key (`game_member.pubkey`) before accepting. Group
   index is `floor(turn_index / GROUP_SIZE)`, first writer wins on
   `(session, group_index)`, a group also closes on match end and on abandonment
   attested by `realtime.presence`. Start at 2 for feel, needs 4 for 200. This is
   what reaches 200. Async rooms stay per turn: no witness, no live socket.
3. **Peer gap repair.** A receiver that detects a skipped live index asks the
   actor to resend over the socket instead of waiting for the log. Zero gateway
   cost; makes the poll purely a safety net.
4. **Smaller.** Cache the `/api/chat/online` presence hydration and the realtime
   token mint; measure the lifecycle writes (room, members, settlement) with the
   ledger, since they decide the group size.

## What to feel in testing

- **Grace window** for a disconnected turn holder is 30s, needing two presence
  checks. Too short and a wifi blip forfeits a turn; test on mobile.
- **Refresh mid-turn** shows the board at the last handover and the in-progress
  turn lands as a block when it commits.
- **Lost live frame** stops live play for that turn; the rest lands as a block.
  Shows as `live`/`gap` in `/dev/lag`. `unverified` there means a key did not
  register; `live-mismatch` on the desync path should never fire in honest play.
- **`owed` gauge** climbs to the size of a turn while acting, by design.
- **Realtime service** caps client publishes at 25 frames/s per socket and
  closes with 1008 on flooding; the client paces at 20/s.
- **Stress harness** players hold no socket: leave `stall check` at 0, and live
  frames, provisional apply and signing can only be felt in real play.

## Open questions

- Does the mock gateway relay client publishes? Verify before relying on local
  dev for the live path.
- Is 200 the real number? If it stays near 50, item 2 is not worth its trust
  surface and item 1 is the whole remaining plan.

## How it works today

Three layers. The **socket** carries every action live and is unmetered: the
acting client signs each frame with its per-match ECDSA key (generated in the
browser, kept in IndexedDB, public half registered on the seat) and publishes
it tagged `sender:turn:index`; receivers verify in arrival order, apply
provisionally, and dedupe the committed events against those in order. The
**cache** holds the poll cursor (written per turn boundary) and presence memory.
The **database** is the source of truth, written per turn.

A turn costs the server 4 reads and 1 write: the client holds its actions and
relays the whole turn at the handover, `appendEvents` stores it as one
`game_event` row (`seq` is the first action's id, `span` the count, readers
expand it), and the row carries `next_turn` so the pointer is read off the
newest row and never written separately. Surrendered teams live on
`game_room.surrendered`. Presence is asked for, not reported: after 90s of quiet
a client asks `/heartbeat`, which consults `realtime.presence` and resigns only
after two sightings across the grace window, and only if the caller is visible.
A trusted-socket poll asks `?cursor=1` and gets one cache read; every poll
carries `pollAfterMs` (30/60/120s by headroom). The trace stays in the browser
and is archived once at game over to private storage; only evidence writes
`game_log`. Rate-limit awareness, 429 retry with the server's `retryAfter`, and
the busy countdown ship in `rateLimit.ts` and `GameSocket`.

Ceiling now: roughly 90 matches on writes before lifecycle, from 4. Migrations
to apply with `pnpm migrate`: `create_game_room_standing`,
`create_game_event_span`, `create_game_event_turn`, `create_game_member_key`.
Stress test result before the relay change: 10 rooms at 1x sat at 85 to 90% of
`db/read`, exactly where the model put it.
