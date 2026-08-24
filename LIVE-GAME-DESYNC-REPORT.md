# Live game desync: the attack that never happened

**Reported symptom.** Player 1 moves a Flak Tank out of fog and attacks a Player 2
unit. On P1's screen the tank moves and the attack lands. On P2's screen the tank
drives into position and then just sits there. From that point the two clients hold
different boards, and every later exchange widens the gap.

**Verdict.** Confirmed against the actual event log for match 11
(`session yvwVsg1V2HRpKHrk`). The cause is **the shared event log itself being
recorded out of order**. The move and the attack were both relayed, both stored —
but the attack was assigned a LOWER sequence number than the move that enabled it.
Replaying that log in recorded order drops the attack, which is exactly what P2 saw.

Three separate ways for a live match to split are fixed here. The log-ordering one
is the proven cause of this match; the other two are real bugs found while tracing
it that could produce the same symptom.

---

## 0. The evidence: match 11's log is provably misordered

Player 1 is `984c47…` (seat 0, team 0); Player 2 is `1441ae…` (seat 1, team 1).

```
seq 69  P1  attack  from 15 -> 16    ts 1787578817293
seq 70  P1  move    from 13 -> 15    ts 1787578819839
```

P1 moved a unit from tile 13 to tile 15 and attacked tile 16 from there. The
interactor can only emit those in that order — `performAttack` runs in the callback
of the move's `animateRoute(...).then(...)`, so the move is relayed at the start of
the slide and the attack strictly after it. The log has them the wrong way round.

Replaying the log as recorded:

- **seq 69** — attack from tile 15. Tile 15 is empty; the unit is still at 13.
  `applyAttack` hits `if (!attacker || !target) return`. **The attack is dropped.**
- **seq 70** — the unit moves 13 → 15 and sits there.

P1 applied both locally in the true order and saw the hit land. P2, the replay, and
any reconnecting client apply the recorded order and see the tank roll into position
and do nothing. That is the report, exactly.

This is not a one-off. Four of ~18 multi-action sequences in this match are inverted,
all with the same shape — an action recorded before the move that makes it possible:

```
seq 16  wait   tile 4          seq 17  move 12 -> 4
seq 21  wait   tile 86         seq 22  move 67 -> 86
seq 42  wait   tile 46         seq 43  move 49 -> 46
seq 69  attack 15 -> 16        seq 70  move 13 -> 15   <-- the reported bug
```

The three `wait` inversions were harmless (`markTileActed` on a tile whose unit
arrives a moment later is a no-op that corrects itself). The `attack` inversion was
not.

The tail of the log shows the consequence: from seq 84 to seq 93 both players do
nothing but `end-turn`, roughly 32 seconds apart each, until P2 surrenders at seq 94.
That is two people staring at boards that no longer agree.

### Why the sequence numbers inverted

`appendEvent` assigns `seq` from the current row count:

```js
const seq = await db.count('game_event', { session })
const inserted = await db.insertIgnoreConflict('game_event', { session, seq, ... })
```

The `(session, seq)` primary key makes that atomic, and a lost race retries at
`seq + 1`. What it does **not** do is preserve the order the player acted in. `seq`
records the order requests _win the insert race_, which for two overlapping requests
is a coin flip.

And the relays did overlap, because `GameSocket` fired them all in parallel:

```js
const onOutgoing = (action) => { locallyEmitted.add(...); void relay(action) }
```

`void relay(...)` — fire and forget. Move and attack were in flight at the same time,
and roughly one time in five the attack won.

A forensics wrinkle made this much harder to see: `ts` was stamped _inside_ the retry
loop, so the row that lost the race carried the time of its retry rather than the
time it arrived. The inverted rows have consistent-looking ascending timestamps —
nothing about them reads as wrong. Fixed: `ts` is now stamped once, before the loop.

### Fix, part 1: the client sends one request at a time

Outbound relays are chained — one POST in flight per client, in emission order. The
move's `seq` is assigned before the attack's request is even sent.

### Fix, part 2: the server enforces it

Chaining alone is a convention, and a convention that only holds while nobody
touches the call site. The ordering is now a constraint the database enforces.

Each relay carries `clientSeq`, the sender's own 0-based counter for the room. Unlike
`seq` — which records which request won its insert race — this carries the order the
_player_ acted in. `appendEvent` refuses to record an event whose predecessor from
the same sender isn't in the log yet:

```
append(attack 15 -> 16, clientSeq 1)   ->  OutOfOrderEventError (expected 0)
                                           nothing written
append(move 13 -> 15,   clientSeq 0)   ->  seq 69
append(attack 15 -> 16, clientSeq 1)   ->  seq 70   <- behind the move, where it belongs
```

The endpoint answers a refused append with `409 { expected }` rather than a bare
error, so the client resets its counter and retries instead of guessing.

Ordering follows the **sender**, attribution follows the **actor**. Those differ when
a human drives a CPU seat: the AI's actions ride the driver's request stream (one
stream, one counter) while still being credited to the AI in the log.

### What this also fixes: duplicate actions

A unique index on `(session, sender_session, client_seq)` means a re-sent request — a
browser retry, a double-fired handler, a `fetch` that threw after the server had
already committed — collides instead of appending the same action twice. Previously
a retried move POST would have read the row count again and recorded a second,
identical move. `appendEvent` now returns the stored row.

That property is what makes the client's own retry safe: on a network error it
re-sends the **same** ordinal, because it cannot know whether the request landed.

### Two edge cases worth naming

- **A reload restarts the counter at 0.** The events poll now returns
  `clientSeq` — where that caller's stream resumes — and the client seeds from it,
  but only while the relay chain is idle so a poll can't rewind the counter under an
  in-flight request. The 409 remains the backstop.
- **A reused ordinal carrying a _different_ action is refused, not deduped.** Treating
  it as a duplicate would hand back an unrelated old event and silently swallow a
  real action, which is a worse failure than the one being prevented.

---

## 1. Second cause: the poll bypassed the animation queue

`GameSocket.svelte` had **two** ways for an inbound event to reach the board:

| path                | code                                                | behaviour                                          |
| ------------------- | --------------------------------------------------- | -------------------------------------------------- |
| realtime push       | `onRealtimeEvent` → `applyEvent(event, live: true)` | pushed onto a serial queue, animated one at a time |
| reconciliation poll | `poll()` → `applyEvent(event, live: false)`         | **applied straight to the board, synchronously**   |

Applying a remote move is not instantaneous. `animateRemoteAction` does this:

```js
map.layers.units[action.from] = null   // lift the mover off its source tile
await animateRoute(...)                // ~200ms per tile
map.layers.units[action.from] = unit   // put it back
applyAction(map, action, { live: true })  // NOW commit the real move
```

For the duration of that slide the mover is on **neither** tile — not the source
(nulled) and not the destination (not committed yet).

The poll applied its events into that window. Sequence:

1. P1 moves the Flak Tank `A → B`, then attacks from `B`. Two events, `#100` and
   `#101`.
2. P2 receives `#100` over realtime. It queues, starts animating — tank lifted off
   `A`, sliding toward `B`.
3. Mid-slide, P2's reconciliation poll fires and returns `#101` (the attack).
   `applyEvent(evt, false)` calls `dispatchSerializedAction` **immediately**,
   skipping the queue.
4. `applyAttack` reads `map.layers.units[B]` → empty (the slide hasn't committed).
   It hits `if (!attacker || !target) return` and drops the attack **in total
   silence**.
5. The slide finishes and commits the move. The tank is on `B`. The attack is gone
   forever — it is never retried, and nothing anywhere notices.

That is precisely the reported behaviour: move plays, attack doesn't, no error, one
client's unit damaged and the other's not.

The fog detail in the report is a real part of the trigger, not a coincidence. If
neither endpoint is visible to the viewer, `animateRemoteAction` skips the slide and
applies instantly — no window, no bug. The window only exists when the move IS
animated, which is exactly the "unit emerges from fog into view" case: `action.to`
is visible, so the slide plays and the race opens.

**Why it kept getting worse.** There is no reconciliation of any kind. Once the two
boards differ, they simply stay different, and every subsequent action is applied to
divergent state. A unit that should be dead survives on one side, kills something,
captures a building, and the trees of consequence separate further every turn.

### Fix

All inbound events now go through one serial queue, in event-id order, with **no
fast path**. Extracted to `src/lib/Components/Socket/eventQueue.ts` so the ordering
guarantee is unit-testable, with the rationale written into the module.

- `applyEvent` never applies; it only accepts and enqueues.
- The poll's events queue behind an in-flight animation instead of jumping it.
- What _animates_ is unchanged: catch-up/backfill still fast-forwards instantly, live
  pushes still get choreography, a backlog still fast-forwards to avoid falling
  behind.
- `lastEventId` (accepted) and `appliedEventId` (actually on the board) are now
  tracked separately; they differ exactly while the queue drains.

Regression test: `tests/Engine/socketEventQueue.unit.test.ts` — holds a move
mid-animation, delivers the follow-up attack over the poll, and asserts the board is
not touched until the slide completes.

---

This one is not proven to have fired in match 11 — the log inversion alone accounts
for the reported symptom — but it is the same failure through a different door, and
it would have been invisible in exactly the same way.

---

## 2. Third cause: every failure was silent

`applyAction` bails out of nearly every case when the unit or building the action
names isn't there. That is correct for replay and headless simulation. Online it is
the mechanism by which a match quietly breaks.

**Fix.** `src/lib/Engine/desync.ts`. The bail-outs still bail — there is no coherent
state to apply the action to — but they now report. Nothing in engine behaviour
changes; local, campaign and replay play have no listener attached, so it stays a
no-op there. Online, `GameSocket` listens and:

- logs the action, the reason, and a board snapshot to `game_log`, flushed immediately;
- shows the player a non-blocking **"Out of sync with your opponent — Resync now"**
  banner.

Resync is a reload, which re-runs `poll(since=-1)` from a fresh board and replays
the whole log in order. **That fixes a client-side drop; it does not fix a misordered
log.** In match 11 a reload would have rebuilt P2's board from the same inverted log
and left them just as far from P1. The banner is therefore honest about what it is —
a recovery for local drift — and the real defence against log corruption is the
chained relay in part 0, which stops it being written in the first place.

Tests: `tests/Engine/desyncDetection.unit.test.ts`.

---

## 4. Logging for live games (the second ask)

You were right that nothing was recorded. `game_event` records what the **server**
was told. It does not record which client received what, over which transport, in
what order, or what board each client ended up with — which is the entire failure
surface. Both clients agreed on the action list in your broken game and still had
different boards; the shared log alone can never show that.

### New: `game_log` table

`src/lib/Migrations/create_game_log.sql.ts`, registered in `list.ts`. Per-client
observational trace, one row per entry:

| kind     | what it records                                                                                                                           |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `out`    | an action this client relayed, and the server's answer (`sent` / `rejected` / `failed`, with the assigned event id)                       |
| `in`     | an event received: id, transport (`push` vs `poll`), and disposition (`queued` / `applied` / `animated` / `deduped` / `stale` / `no-map`) |
| `state`  | a **board digest** anchored to an event id                                                                                                |
| `chat`   | an in-game chat line — group chat is realtime-only, so this was previously recorded nowhere at all                                        |
| `desync` | an action the engine refused to apply, with the board snapshot that produced it                                                           |
| `note`   | breadcrumbs: join, realtime up/down, pagehide, resync requested, leave                                                                    |

### The board digest is the actual detector

`src/lib/Engine/boardDigest.ts` hashes the authoritative board — unit positions,
health, team, cloak, transported passenger, Warmachine wallet, building ownership,
capture progress, income reservoir, money, turn pointer. It deliberately excludes
per-viewer state (fog, selection) and animation scratch fields (`displayHealth`,
`animating`), which legitimately differ between clients and would produce false
positives.

Each client records one at every turn boundary. **Two clients reporting different
digests for the same event id have provably diverged, and the last id they agreed on
is where it happened.** That turns "the game went weird around turn 12" into an exact
event number.

### Reading it back

`GET /api/game/{session}/log` (room members, or anything in dev) returns the trace
with the analysis already done:

```json
{
  "players": { "<userSession>": "P1", "<userSession>": "P2" },
  "firstDivergenceEventId": 101,
  "divergences": [{ "eventId": 101, "byClient": { "P1": "a3f19c02", "P2": "7d10bb55" } }],
  "desyncs": [{ "at": 100, "by": "P2", "reason": "missing-attacker", "action": {...} }],
  "entries": [ ... full ordered trace ... ]
}
```

`POST` is the client sink: `src/lib/Engine/liveLog.ts` buffers entries and flushes in
batches (2.5s window, or 25 entries, or immediately on a desync), with a `sendBeacon`
flush on `pagehide` so the trace of a match someone walked out of still lands.

Every part of this is best-effort by construction: malformed batches are dropped, the
POST always returns 2xx so no client ever retries or backs off, oversized details are
truncated rather than rejected, and the buffer has a hard ceiling that drops oldest
first. **Logging must never be able to affect the match it is observing.**

---

## Files

**Fixes**

- `src/lib/Components/Socket/GameSocket.svelte` — **chain outbound relays** (the proven fix), queue everything inbound, desync banner
- `src/lib/Components/Socket/eventQueue.ts` _(new)_ — the single ordered path to the board
- `src/lib/Game/store.server.ts` — `appendEvent` stamps `ts` once so a retry can't misreport when an action arrived
- `src/lib/Engine/desync.ts` _(new)_ — unapplyable-action reports
- `src/lib/Engine/applyAction.ts` — silent bail-outs now report

**Logging**

- `src/lib/Engine/boardDigest.ts` _(new)_ — deterministic board fingerprint
- `src/lib/Engine/liveLog.ts` _(new)_ — client recorder + batched flush
- `src/lib/Migrations/create_game_log.sql.ts` _(new)_ + `list.ts`
- `src/lib/Game/store.server.ts` — `appendLog` / `readLog`
- `src/routes/api/game/[session]/log/+server.ts` _(new)_ — POST sink + GET analysis
- `src/lib/Components/Socket/GameChat.svelte` — chat lines now recorded

**Tests**

- `tests/Engine/socketEventQueue.unit.test.ts` _(new)_ — 7 tests, ordering guarantee
- `tests/Engine/desyncDetection.unit.test.ts` _(new)_ — 6 tests, detection + digest

## Match 11 itself

Nothing recovers that game — the corruption is baked into its stored log, so its
replay will always show the tank not firing. Left as-is; it is now a useful
regression fixture.

## Before this ships

**`pnpm migrate` is needed again.** The `game_log` run does not include
`create_game_event_ordering`, which adds `sender_session` / `client_seq` to
`game_event` and the unique index that enforces ordering. Until it runs, the append
path falls back to the old unordered behaviour — additive alters, so existing rows
and any client mid-match are unaffected either way.

The table has no retention policy. `create_game_log.sql.ts` includes a `created_at`
index for exactly that; a prune cron alongside `api/cron/prune-messages` is the
obvious follow-up once we know the row volume in practice.
