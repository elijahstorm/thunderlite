# Scaling the gateway call budget to 200 parallel matches

Working plan, decided 2026-09-02. Built off the match 24 measurement (session
`5pAAGtnTr8eQKzNX`, 22 min, 622 events, 60 turns, peak 39% of the tightest budget
for a single match). Earlier ideation lives in git history.

## Decisions

- **Target is 200 concurrent live matches.** Real, not aspirational.
- **Same shape as today.** Realtime carries live actions, the database stays the
  source of truth, but the database is written per turn group rather than per
  action, and read per reconnect rather than per poll.
- **Poll stays at 30 seconds** and its cursor check moves to the `cache` namespace.
- **Turn group size is a config knob.** Start at 2 turns per row for the feel test.
  It must reach 4 before 200 is real (see the write budget table below).
- **Degradation over breakage.** Under budget pressure the app slows down visibly
  rather than failing a move. Most of this already ships; one hint is missing.
- **Disconnecting mid-turn is lossy, never restorative.** A turn is never re-taken.

## The arithmetic that forces the design

Budgets are per project per minute, shared across every room at once:
`db/read` 900, `db/write` 300, `cache` 1000, `realtime` 1200, `storage` 120.

At 200 matches each match gets **4.5 reads, 1.5 writes and 5 cache calls per
minute**. Match 24 spent 227 reads and 67 writes.

Two consequences that are not negotiable:

**The server cannot be in the per-action path.** Match 24 ran 28.4 actions per
minute. At 200 matches that is 5,680 actions per minute, and the largest budget of
any kind is realtime at 1,200. Caching the preflight only moves the call from
`db/read` to `cache` and caps out near 45 matches. So the acting client publishes
its own actions over the WebSocket, which terminates at the realtime service and is
not metered by the gateway. `realtimeClient.ts` already has `publish()` and
`GameChat.svelte` already uses it in production.

**The write unit has to be a group of turns.** At 200 concurrent 22-minute matches,
roughly 9 start and 9 finish every minute. Their room, member and settlement rows
are about 100 writes a minute before a single turn is stored. What is left decides
the group size:

| Turns per row | Turn rows/min at 200 | With lifecycle | Share of 300 | Left for the rest of the site |
| --- | --- | --- | --- | --- |
| 1 | 548 | 648 | 216% | over |
| 2 | 274 | 374 | 125% | over |
| 3 | 183 | 283 | 94% | 17/min |
| 4 | 137 | 237 | 79% | 63/min |

Group size 2 fits about 130 matches. Group size 4 fits 200 with headroom. The
lifecycle figure (6 writes per start, 5 per settlement) is an estimate and should be
measured once the ledger is attributing by route.

## Where things live

- Metered client shim, every gateway call passes through it: `src/lib/dontcode/server.ts`
- Budgets, breakers, headroom: `src/lib/Security/rateLimit.ts`
- Spend by route, viewable at `/dev/lag`: `src/lib/Security/gatewayLedger.ts`
- Hot routes: `src/routes/api/game/[session]/{move,events,heartbeat,log}/+server.ts`
- Store helpers: `src/lib/Game/store.server.ts`
- Browser socket with client publish: `src/lib/dontcode/realtimeClient.ts`
- Client relay, poll cadence, push trust: `src/lib/Components/Socket/GameSocket.svelte`
- Ordering buffer for out-of-order pushes: `src/lib/Components/Socket/pushBuffer.ts`
- Trace recorder: `src/lib/Engine/liveLog.ts`
- Replay loader: `src/routes/(app)/replays/[matchId]/+page.server.ts`

## Three layers, and what each one owns

| Layer | Owns | Cadence | Budget |
| --- | --- | --- | --- |
| Realtime socket | Every action, live, to every participant | Per action | Unmetered (socket frames) |
| `cache` | Poll cursor, room hot state, presence TTLs | Per 30s poll, per turn | 1000/min |
| `db` | Turn groups, room, members, matches, settlement | Per turn group, per lifecycle event | 900 read, 300 write |

The database remains the only source of truth. Realtime is transport and the cache
is a convenience; both can be lost without losing the match, at the cost of a bounded
number of turns (see commitment below).

## Commitment model

The requirement is that a player can never gain by faking a failure. That rules out
rollback to a boundary, so the rules are:

- **An action is committed when another participant receives it.** Not when the
  actor sends it and not when the database stores it. The witness holds it.
- **An actor leaving mid-turn forfeits the rest of the turn.** Actions the witness
  saw stay. Actions the actor took but never published are gone, and the actor faces
  the board as the witness saw it on return. Quitting can only cost moves.
- **Group rows are sealed by a witness, on service-attested presence.** A row for
  turns that includes an actor's disappearance is sealed when
  `realtime.presence(channel)` says they are gone, never on a peer's opinion that
  they are. Otherwise a losing player could seal early and rob the opponent of moves.
- **First writer wins on `(session, group_index)`.** Any participant may write a
  group, because every participant witnessed the whole stream. A late actor cannot
  extend a turn after the group closed. Both writing is harmless; a disagreement is
  a desync the existing digest machinery already detects.
- **Grouping is deterministic with no coordination.** `group_index = floor(turn_index / GROUP_SIZE)`.
  Both clients compute it identically. A group also closes on match end and on
  abandonment, whatever its size.

One exploit this does not fix, and it is pre-existing: a client can compute an action
locally, see the fog reveal, and decline to publish. Commitment happens at publish now
and at relay today, and the client sees the outcome first in both. Same granularity.
Only server-side simulation or commit-reveal closes it, and neither is in scope.

Rooms with no other human, like match 24 after seat 1 surrendered, have no witness.
That is fine: there is nobody to cheat, and it lines up with the rated rule of two
humans with distinct auths. Rated play always has a witness while the game is live.

Exposure to a genuine double disconnect is bounded by the group size: at most one
unsealed group is lost. That is acceptable where a unilateral drop is not, because
no single player can cause it.

## Write path: turn groups

- New table, roughly `(session, group_index, turns jsonb, sealed_by, sealed_at)`,
  unique on `(session, group_index)`. Each turn inside carries `actor`, `turn_index`,
  and its ordered actions. Copy the `insertIgnoreConflict` idiom from `appendEvent`.
- `GROUP_SIZE` is an exported constant read by both the client (to know when to
  seal) and the replay loader (which does not care, it flattens).
- The receiver of the closing end-turn writes the row. It holds the complete group
  and is about to be idle while the actor is busy.
- `current_turn` is derived from the newest group's last turn rather than written
  separately. That halves the write cost for free.
- Row size: a group of 4 turns at match 24's ~10 actions per turn is ~40 actions,
  comfortably under the 60KB ceiling convention the trace packing already uses.
- `matches.last_event_id` becomes a group index. Settlement and history are unchanged
  otherwise.
- `hasSurrendered` and `standing` stop replaying the log. Surrendered is a field on
  the room row or its cache hash. Today both read the entire event log on every move
  and every end-turn, which is both a call and a payload that grows with match length.

Migration path: the new table lands alongside `game_event`, new matches write groups,
the replay loader reads whichever exists. `game_event` rows are never deleted so
existing replays keep working.

## Read path: cache cursor, 30 second poll, peer repair

- The room's cursor (`last_group_index`, `last_turn_index`, `current_turn`) lives in
  one cache hash. Whoever seals a group updates it. The poll reads that one key.
  At 200 matches and two clients that is 800 cache calls a minute, within 1000.
- Nothing else per-action may go on `cache`. A per-turn tail was considered and
  rejected: it would add 548 calls a minute and blow the budget. If the poll ever
  moves to 60 seconds it frees room for it, but the double-drop exposure it would
  close is already acceptable.
- **Peer gap repair replaces the poll as the lost-frame detector.** Actions carry
  `(turn_index, index)`. A receiver that sees a hole asks the actor to resend over
  the same socket. Zero gateway cost, the actor is present by definition, and it
  detects per frame instead of per poll. `pushBuffer` already holds out-of-order
  pushes waiting for the hole; this extends it to request the fill.
- Reconnect reads the database once for sealed groups, the cache once for the
  cursor, then asks the acting client over the socket for the in-progress group.
- Removing the fast poll also removes the instrument that found match 24's five
  push misses. Gap repair is a better instrument, and its counts should land in the
  trace so `/dev/lag` still shows frame loss.

Match 24 measured the socket connection itself as never dropping (0 of 162 gauge
ticks with `realtimeUp` false), while five frames were either lost or lost a race to
the 1.5 second poll, recovering in 1 to 17 seconds. Design for frame loss on a socket
that stays up.

## Presence off the database

The heartbeat costs 3 reads and 1 write per ping, six pings a minute per client. To
fit at 200 matches it would need a 12 minute interval, which cannot detect
abandonment. It is relocated, not tuned:

- Who is here is answered by `realtime.presence(channel)` and the socket's own
  `onStatus`, both already in use.
- If a timestamp is wanted, `cache.set` with a TTL. Absence is key expiry.
- The absence sweep runs on presence loss, not on a schedule.

## Trace off the database

24 writes a minute per match is 16x the whole write budget at 200 matches. Options in
order of appeal, and the choice can wait until the game log is done:

1. One blob per match to `storage` at match end. `storage` is 120/min and idle.
2. Persist on incident only: desync, refused relay, flagged room.
3. Sample a share of rooms plus anything rated.

Keep the property the current code fought for: evidence gets written even under
pressure. Whatever is chosen, it lands in the same step as the game log or the trace
becomes 90% of writes and the exercise buys nothing.

## Back-pressure, and the one missing piece

Already shipped and not worth revisiting:

- Per-namespace breakers reading `RateLimit-*` off every response (`rateLimit.ts`).
- Relay retry on 429 honouring the server's `retryAfter`, six attempts, 20s cap,
  ordinals left unconsumed so re-sending is safe (`GameSocket.svelte`).
- Player-visible countdown via `x-service-busy` and `ServiceBanner.svelte`.
- `budgetPressure` gating optional work at 20% headroom.

Missing: **the server never tells a client to slow down.** The poll interval is a
client constant. Add a `pollAfterMs` on the poll and move responses, derived from
`budgetPressure` on `cache` and `db/read`, and have `GameSocket` honour it. Under
pressure a room polls at 60 or 120 seconds instead of 30 and nobody notices, because
realtime is carrying the match.

## Sequencing

1. **Presence off the database.** Independent, removes the idle-room floor, no
   protocol change.
2. **Surrendered as a field, seq as a counter.** Kills the two full-log reads per
   turn. Independent and immediately felt on relay latency.
3. **Cache cursor poll at 30s plus the `pollAfterMs` hint.** Independent of the
   write path.
4. **Turn group table, replay flatten, `current_turn` derived.** Server still
   sequences at this step; the row just gets written per group. This is where the
   group size knob appears and can be felt.
5. **Trace to storage or incident-only.** Same step as 4 or the numbers lie.
6. **Client publish with peer gap repair and witness sealing.** The largest change
   and the only one that alters who orders events. Behind a flag on casual rooms
   first; rated keeps the server relay until it has proven itself.

Steps 1 through 5 with the server still relaying get to roughly 40 matches. Step 6
is what gets to 200.

## Testing: what to feel, and the baselines to beat

The feel test is about whether the group size shows. Match 24 gives the before:

| Signal | Match 24 | Where it lives |
| --- | --- | --- |
| Relay round trip p50 / p95 / max | 1080 / 2987 / 10104 ms | `lag.players[].relayP50` etc. |
| Host actions owed to the room, max | 17 | `maxOwed` |
| Receiver queue lag, max | 2901 ms | `maxQueueLagMs` |
| Fast-forwarded turns | 0 | `catchingUpShare` |
| Push misses | 5 | `realtime-unreliable` notes |

What to watch as the group size moves from 2 to 4:

- **Reconnect time.** The one place group size is directly felt. Larger groups mean
  a longer in-progress tail to request from the peer.
- **Double-drop loss.** Should be zero in testing; if it is not, the abandonment
  seal is firing on peer opinion rather than presence.
- **`catchingUpShare` stays at 0.** Client publish should make relays faster, not
  slower. If spectators start fast-forwarding, something in the socket path is
  serialising.
- **`db/write` share at `/dev/lag`** with N rooms open, extrapolated to 200. This
  is what actually decides whether the knob is 2, 3 or 4.
- **Frame loss count** from gap repair, per room per hour. It should match or beat
  the five per match the poll used to find.

## Risks and open questions

- Per-connection or per-channel message caps on the realtime service are not
  documented. Confirm before betting the design on unmetered frames.
- Does the mock gateway carry client publish? `GameChat` works locally, which
  suggests yes; verify before step 6.
- The lifecycle write estimate (100/min at 200 matches) is a guess. Measure it early
  because it moves the group size decision.
- At 200 matches, `/api/chat/online` presence hydration and token mints on
  reconnect become visible lines because they scale with players rather than
  actions. Both are cheap to cache. Not a problem yet.
- **The budgets are fixed from our side.** Thunderlite is a real-life stress test
  of the production DontCode product, which has many other clients to support.
  Limits are not raised in dontcode-backend because this app wants them; if they
  rise later from infra expansion on that end, this plan can follow. Every answer
  here has to be fewer or cheaper calls. If group size 4 feels wrong in testing,
  the remaining levers are larger groups, cheaper lifecycle writes, or fewer rooms.

## Plan amendments from the pitfall review

- **Async matches are exempt.** No witness and no live socket, so a group could
  take a week to seal. Async keeps the server relay and one row per turn exactly as
  today. Volume is low enough that the budget is fine.
- **Verify frame identity before step 6.** Whether the realtime service attaches
  the minted token's `identity` to delivered frames is unknown. If it does not, a
  client can publish as its opponent and client publish is blocked until frames are
  signed. This is a prerequisite, not a follow-up.
- **The 30s poll and a per-turn cursor cannot both fit on cache** (800 + 548 against
  1000). Either the poll moves to 60 seconds, or whose-turn on the lobby and room
  list is accepted as up to N turns stale. Decide during testing.

## Testing notes: pitfalls and player feel

How each decision lands on the player, and what to watch.

| Decision | Happy path | When it goes wrong |
| --- | --- | --- |
| Client publish | Relay p50 from ~1s to tens of ms; host AI backlog disappears | Lost frame with failed gap repair is a silent desync; player sees the resync prompt |
| Turn groups | Invisible; actions arrive via realtime | Refresh shows a board up to N turns behind, then jumps or fast-forwards |
| Lossy disconnect | Invisible to honest players | A short wifi blip mid-turn forfeits the turn if the grace window is short. Worst feel in the plan |
| 30s cache poll | Invisible | If gap repair also fails, a move arrives 30s late instead of 1.5s |
| Presence off db | Invisible | Wrong grace: false "opponent left" resignations, or an absent player never resigned |
| Rated keeps server relay | Casual feels instant | Rated feels laggy by comparison |
| Trace to storage | Invisible | Incident-only loses healthy-match debugging; prefer one blob per match at end |

Pitfalls to carry into the test plan:

- **Grace window is the central tension.** Anti-cheat wants it short, blips want it
  long. Start at 30 to 60s with the opponent shown "waiting for reconnect" and a
  countdown. Test on mobile with a network switch.
- **Seal failures retry silently, never banner.** No relay 429 exists to hang the
  busy toast on. A repeatedly failing seal grows the durability window; it needs
  backoff and an eventual "match not saving" surface.
- **Seal the final group inside the `/result` POST**, or a replay can miss its last
  turns when both players close at game over.
- **Reconnect depends on a peer answering.** Test refresh during the opponent's
  turn, during your own turn, and with the peer backgrounded.
- **Double drop loses up to N turns.** Not exploitable, but both players return to
  a board behind what they remember. The UI has to say so.
- **Realtime presence is not player presence.** Background tab with an open socket
  reads present; a phone switching networks reads absent for seconds. Neither
  matches the current 10s heartbeat semantics.
- **Handover races.** A client must refuse to publish after its own end-turn. The
  server used to enforce this; now only the client does.
- **`owed` becomes meaningless.** Replace with unacknowledged-by-peer or `/dev/lag`
  lies.
- **Two code paths** (rated on relay, casual on socket) double the test surface.
- **Mock gateway.** Confirm it relays client publishes, or local dev silently runs
  the old path.
- **Realtime service limits** on frame size and rate per connection are
  undocumented. A host driving two AI seats publishes a dozen frames in a burst.

## Progress log

### 2026-09-02, first build session

Landed, each as its own commit, all tests green (106 unit tests in `tests/Game`):

- **Stress harness.** `/dev/server-stress-test` plays N rooms against whatever
  gateway `DONTCODE_API_URL` names, paced by a script reduced from match 24.
  Virtual players use an `x-stress-user` header that hooks honours only in dev.
  Not yet run against any gateway; the local mock was not up and the production
  key is Elijah's step.
- **Step 1, presence.** Heartbeat gone. A client asks `/heartbeat` who holds a
  socket only after 90s of quiet; resign needs two sightings across the grace
  window; the caller must be visible in presence or nothing is swept.
- **Step 2, standing.** `game_room.surrendered` written by `appendEvent`;
  `standing()`/`hasSurrendered()` read it and take the rows the move route
  already holds. Migration `create_game_room_standing`, apply with `pnpm migrate`.
- **Step 3, poll.** `?cursor=1` answers a caught-up client from a cache cursor
  written per turn boundary; every poll carries `pollAfterMs` (30/60/120s by
  budget headroom) and the client honours it.
- **Step 5, trace.** Kept in the browser, archived once at game over to private
  storage; only evidence (desync, refused relay, resync, pagehide) still writes
  `game_log`. `/log` GET merges both sources.
- **Move route.** The room row was read twice per relay; now once.

Where that leaves a match today, per minute: writes ~31 (event inserts 28.4,
turn pointer 2.7, the rest gone), reads ~110 (five per relay, nothing else).
Ceiling about **7 to 9 concurrent matches**, up from 4. The remaining 25x gap is
entirely the per-action server relay, which is steps 4 and 6.

### Two findings that gate steps 4 and 6

**The realtime worker does not stamp the sender on relayed frames.** In
`dontcode-workflows/workers/realtime/src/server.ts` a client `publish` frame is
fanned out as `{ type: 'message', channel, payload }` with the payload verbatim;
the connection's `identity` is registered for presence but never attached. So a
client-published action's actor is whatever the client claims. `GameChat` already
lives with this (its `source` is self-asserted). For actions it means:

- The **live path** can still be client-published today: a forged frame can only
  mislead an opponent's screen until the durable turn arrives, cookie-authenticated
  and server-validated, and the receiver reconciles. That is griefing, not
  cheating, and the resync handles it.
- The **witness model** (an opponent seals a group it received) cannot trust who
  sent what, so group sizes above one, and therefore 200, are gated on one of:
  the worker stamping `from: identity` on relayed frames (a DontCode product
  feature, not a limit change), or thunderlite signing frames with a per-match
  keypair registered at join. The first is a few lines in the worker; the second
  is a chunk of work here. Elijah's call.

**The worker rate-limits client publishes at 25 frames per second per socket**
(`REALTIME_MSGS_PER_SEC_PER_CONNECTION`, default 25) and closes the socket with
1008 on sustained flooding. A host driving two CPU seats publishes a dozen frames
in a burst; that fits, but the client publisher must pace bursts under 25/s and
must reconnect on 1008 rather than treat it as fatal.

### Revised shape for steps 4 and 6

The plan had step 4 (turn rows) before step 6 (client publish) with the server
still sequencing. That cannot work: a stateless server cannot hold a turn's
actions between relays, so per-turn rows require the client to hold the turn and
relay it whole at end-turn, and live delivery to the opponent then has to come
from somewhere else, which is client publish. They are one step, in two halves:

- **4a.** Client publishes each action over the socket tagged
  `{ actor, turn, index }` for live display. Receivers apply provisionally.
  Server stops publishing per relay.
- **4b.** The actor relays its completed turn once, at end-turn, to a new
  `/turn` route: one row per turn, server-validated against the cookie identity
  and the turn pointer, cursor written, `current_turn` derived. Receivers
  confirm their provisional actions against the committed turn (count and
  fingerprint) and resync on mismatch. Reconnect mid-turn sees the turn land
  when it commits. This reaches roughly **90 matches** with no trust change.
- **6.** Witness sealing and groups of N, once the identity question is settled.
  This is what reaches 200.

### 2026-09-03, second build session

Measured first: 10 rooms at 1x on production sat at 85 to 90% of `db/read`, which
is where the model put it (five reads per relay, 22 relays a minute per room).

Landed, as separate commits, all tests green (108 in `tests/Game`, 1567 overall):

- **Step 4b, the write unit.** A `game_event` row may hold a whole run:
  `seq` is the first action's id, `span` how many follow, `client_span` how many
  sender ordinals it consumed; `toEvents` expands on read so every reader still
  sees a flat, contiguous log. Next id and next ordinal come from the newest row,
  not a count. Migration `create_game_event_span`, apply with `pnpm migrate`.
- **Step 4a, the live path.** The acting client publishes each action over the
  socket as it takes it and holds the durable relay until the handover: one
  `/move` per turn, one row. Receivers apply live frames provisionally and dedupe
  the committed events against them in order; a lost frame (index skipped) stops
  live application for that turn and the remainder lands from the log as a
  block; a committed action that differs from the provisional one reports
  `live-mismatch` on the desync path. Frames are paced under the worker's 25/s
  per-socket cap. Async rooms are unchanged: they relay per action.
- **Simulator** relays whole turns by default (`relayPerTurn`), so what it
  measures is the new shape. Virtual players still hold no socket, so live
  frames and the provisional path can only be felt in real play.

Projected per match per minute now: about 11 reads and 5.4 writes (4 reads, 1
insert and 1 turn-pointer write per turn, 2.7 turns a minute), realtime 2.7
server publishes plus unmetered client frames. That is roughly **55 matches on
writes, 80 on reads**, from 7 to 9 before this session. Deriving `current_turn`
from the newest row instead of writing it is the next cheap step (to ~90); groups
of N (the witness model) is what reaches 200 and is gated on frame identity.

What to feel in testing, beyond the earlier notes: the `owed` gauge now climbs
to the size of a turn while a player is acting, by design; a refresh mid-turn
shows the board at the last handover and the in-progress turn lands as a block
when it commits; and `/dev/lag` shows `live` as a transport in the trace with a
`gap` disposition wherever a frame was lost.
