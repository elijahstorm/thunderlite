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
