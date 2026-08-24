# Match 13: the player whose turn never happened

**Reported symptoms.** Red (P1) moves several units on their first turn. Their own
screen shows the moves land. Blue (P2) starts seeing "Out of sync with your
opponent." Blue reloads repeatedly; the banner comes straight back every time. Red
eventually reloads and finds their units back at their starting positions, as if the
turn never happened. Blue walks onto tiles Red's screen shows as occupied, and Red's
units blink out of existence. Once the banner appears for a player it never leaves,
even after both players have reloaded and are visibly in agreement.

**Verdict.** Confirmed against `game_event` and `game_log` for match 13
(`session JN0mMFlXgW4ylny9`). Three separate defects, and only the first is a
surprise:

1. **Red was playing on a stale JavaScript bundle** loaded before the ordering
   deploy. Its relays carried no `clientSeq`, and the server accepted them anyway
   through a legacy fallback, so one player's out-of-date tab silently opted the
   whole room out of the ordering guarantee that exists to prevent exactly this.
2. **Neither client stopped playing once it knew it had diverged.** The player whose
   actions were being thrown away was never told, and kept commanding units the room
   had never seen move. That is the "Blue walked through my units" symptom.
3. **The banner fired on log replay as loudly as on live divergence**, so a hole
   baked into the shared log re-raised it on every reload. It could not go away,
   because it was reporting on history, not on the present.

---

## 0. The evidence

Red is `984c47…` (seat 0, team 0). Blue is `1441ae…` (seat 1, team 1).

### Red's client was not the deployed client

`game_log` records one row per client observation. Blue's trace starts at the
opening whistle. Red's does not exist until 200 seconds into the match:

```
id 1     1441ae…  note "joined"        ts 1787589464066   <- match start
id 324   984c47…  note "joined"        ts 1787589661389   <- Red's first log row, ever
```

Red produced no `out`, `in`, `state`, or `note` rows before that. The live-log
recorder and the `clientSeq` relay counter shipped in the same commit, and Red's
stored events agree:

```
seq  0   984c47…  end-turn      sender_session NULL   client_seq NULL
seq  8   984c47…  wait tile 3   sender_session NULL   client_seq NULL
...
seq 40   984c47…  move 20 -> 23 sender_session 984c47…  client_seq 0   <- after the reload
```

Red's tab had been open across a deploy. It was running the pre-ordering client, and
`POST /move` accepted it because `clientSeq` was optional.

### The log went out of order immediately, exactly as before

```
seq 8   wait  tile 3        ts 1787589516804
seq 9   move  12 -> 3       ts 1787589516561    <- the move is 243ms OLDER than the wait
```

The old client fired relays in parallel (`void relay(action)`), and `seq` is assigned
by whoever wins the insert race. This is the same inversion that broke match 11, in a
room where the fix was deployed and running for the other player.

### Red's entire first turn is missing from the log

Blue's desync reports are all `missing-mover` on **Red's** moves, out of tiles Blue's
board has nothing on:

```
reason missing-mover   move 12 -> 3     board snapshot: U[17:0:1, 20:0:0, 27:0:1, 41:0:0, 60:0:0, 77:0:1]
reason missing-mover   move 33 -> 13
reason missing-mover   move 72 -> 93
```

Blue's board has Red's units at **20, 41, 60** — the mirror of Blue's own starting
tiles 29, 48, 69. Red's board has them at **12, 33, 72**. Red moved 20 -> 12,
41 -> 33, 60 -> 72 on turn one and **not one of those six actions (three moves,
three waits) is in the log.** Only the `end-turn` that closed the turn was recorded,
as `seq 0`.

From Blue's turn two onward the two clients were playing different games. Red's
subsequent moves referenced tiles that, on every other board in the room, were empty.

**What is not proven:** exactly why those six relays failed. There are no matching
rows in the `logs` error table for that window, so it was not an append error
surfacing as a 500. The old client fired them in parallel, had no retry, and returned
silently on any non-OK response — so a transient gateway failure during that burst
(the same `"This service is temporarily unavailable"` that does appear twice later in
the session) would have dropped all six without a trace anywhere. That is the most
likely mechanism, but the client that lost them recorded nothing, so it cannot be
confirmed. **It also does not need to be.** Whatever ate them, the client applied
them locally, told the player they had happened, and played on. That is the defect
worth fixing, and it is fixed below.

### Why the banner never went away

Blue reloaded four times. Each reload replays the log from `since=-1`, hits the same
holes, and re-raises the same reports:

```
note "resync-requested"  ts …521752   ->  desync missing-mover  ts …527844
note "resync-requested"  ts …552875   ->  desync missing-mover  ts …556854
note "resync-requested"  ts …577286   ->  desync missing-mover  ts …581748
note "resync-requested"  ts …587627   ->  desync missing-mover  ts …591864
```

And when Red finally reloaded (`joined` at …661389), Red's replay raised them too
(rows 279, 308, 320, 340, 365) — which is why the banner appeared for Red "after the
refresh and one extra turn" and then also never left.

By that point both players had replayed the same log and were in perfect agreement
with each other. The banner was telling them they were out of sync because the log
they had both faithfully replayed contained a hole. It was reporting on the past.

### Red's last three actions were refused and silently dropped

```
out  end-turn   result "rejected"  status 403   ts …828095
out  move 71->72 result "rejected"  status 403   ts …836880
out  wait tile 72 result "rejected" status 403   ts …837249
out  end-turn   result "rejected"  status 403   ts …842449
```

Red got a 1.5-second "Not your turn" flash for each. Their board had already applied
every one of them. Blue surrendered eleven seconds later.

---

## 1. Fix: an unordered relay is refused, not served

`clientSeq` is now **required** on `POST /api/game/{session}/move`. A relay without
one gets `426 Upgrade Required` and is not recorded.

The optional fallback was written as backwards compatibility, and that is precisely
what made it dangerous: it is reachable by any browser tab loaded before the deploy
that added it, and it silently downgrades the whole room. One party to a match must
not be able to opt everyone else out of the ordering guarantee. A stale client now
fails to relay — which the new client reports loudly (part 2) and the old client at
least cannot use to corrupt the log.

`appendEvent` keeps its unordered path for server-side callers (auto-resign, timeout
forfeits), which have no sender stream to order against.

- `src/routes/api/game/[session]/move/+server.ts`

## 2. Fix: a client that has diverged stops playing

This is the change that addresses the "Blue walked through my units" report directly,
and it is the one you asked for.

`src/lib/Engine/desync.ts` gains `syncLocked`. Once this client's board is proven not
to be the room's board, gameplay input is frozen until the player resyncs. Guarded at
every local entry point:

| funnel                                                    | file                       |
| --------------------------------------------------------- | -------------------------- |
| board taps, menu actions, factory + adjacent builds       | `Interactor/interactor.ts` |
| `commit` (the backstop every local action passes through) | `Interactor/interactor.ts` |
| end turn                                                  | `GameStateManager.svelte`  |
| a driven CPU seat's relays                                | `cpuAi.ts`                 |

**Surrender is deliberately exempt.** Quitting must always be available, and the
server attributes a surrender to the sender's own team rather than trusting the board
it came from.

Only the online layer ever sets the lock. Local, hotseat, campaign and replay attach
no listener, so nothing off the network path changes behaviour.

### And the other half of a desync is now detected at all

The engine's reports catch one direction: _the log holds something this board cannot
apply_. Match 13's victim suffered the reverse — _this board holds something the log
refused_ — and nothing anywhere noticed. That is strictly the worse failure, because
nothing on the player's screen looks wrong: their units are where they moved them,
and the opponent simply walks through the ones the room never saw move.

A terminal relay outcome now reports a desync on the same path as an engine bail-out:

- `403` rejected (the server disagrees about whose turn it is)
- a `409` the counter cannot self-heal from
- an unrecognised `4xx`
- retries exhausted

The "Not your turn" flash stays as the immediate cause, but it is no longer the whole
response. It read as "that click didn't take", when the click _had_ taken locally.

- `src/lib/Engine/desync.ts`, `src/lib/Components/Socket/GameSocket.svelte`

## 3. Fix: a hole in the log is not a divergence between players

Every inbound event now carries `live` — whether it arrived as live play, or was
pulled out of the log on the way in (the catch-up replay after a load, or a gap
backfill). The commit handlers receive the whole entry, so the socket layer knows
which it is.

A report raised while **replaying** the log is a hole in the shared log. Every client
replays it identically and lands on the same board, so it is not a divergence between
the two players and no amount of resyncing will close it. It is still logged (with a
`/replay` suffix on the reason, since it names exactly where the log broke) but it no
longer accuses the player of something they cannot act on.

A report raised during **live** play means this client alone has drifted. That
surfaces the banner and freezes the board — and a resync genuinely clears it, because
the reload rebuilds from the log and the replay-time reports no longer re-raise.

That is what makes the banner able to go away. In match 13 it could not, by
construction.

- `src/lib/Components/Socket/eventQueue.ts`, `src/lib/Components/Socket/GameSocket.svelte`

## 4. Fix: a stale tab can find out it is stale

`kit.version.pollInterval` is set to 60s, and an online match shows a "A new version
of the game is out. / Reload" prompt when a deploy lands under an open tab.

Harmless on most pages. Not in a live match, where the client speaks whatever sync
protocol it shipped with while the other seat may be speaking a newer one. Reloading
rebuilds the board from the log and costs nothing, so it is worth saying plainly
rather than waiting for the desync.

- `svelte.config.js`, `src/lib/Components/Socket/GameSocket.svelte`

## 5. Fix: gateway failures on the sync path are logged again

Both game routes caught errors with `if (msg && typeof msg === 'object' && 'status' in msg) throw msg`,
meaning "re-throw our own `error(...)` untouched". But the SDK's `DontCodeError`
carries `status` and `body` too, so **every gateway failure on these paths was
re-thrown with the gateway's own status and never reached `logToErrorDb`.** The one
path that records why a relay failed was the one path a failed relay skipped, which
is a large part of why Red's six lost actions left no server-side trace.

Now `isHttpError(msg)` from `@sveltejs/kit`, which is what the check meant all along.

- `src/routes/api/game/[session]/move/+server.ts`, `src/routes/api/game/[session]/events/+server.ts`

The same duck-typed check appears in 9 other routes. Not swept here (they are not on
the sync path and the files are in flight elsewhere), but it is the same bug wherever
a gateway call sits inside the `try`.

---

## Tests

- `tests/Engine/syncLock.unit.test.ts` _(new, 6 tests)_ — input swallowed while
  locked, nothing relayed, board untouched, surrender still permitted, the lock
  clears on a fresh match.
- `tests/Engine/socketEventQueue.unit.test.ts` — extended: the commit handlers
  receive the entry, so replay is distinguishable from live.

Full unit suite: 1113 passing. The 8 failures in `tests/Campaign/progress.unit.test.ts`
are pre-existing and unrelated — confirmed failing at a clean `HEAD` checkout in a
throwaway worktree, and untouched by anything here.

`pnpm check` clean, production build clean.

## What this does not fix

Match 13's log stays broken; its replay will always show Red's opening turn never
happening. Nothing can recover it, for the same reason match 11 could not be
recovered: the corruption is in the stored log, and the log is the only truth there
is.

Clients already in the wild running the pre-ordering bundle will now find their moves
refused rather than recorded. They have no code to explain why. That is the correct
trade — one player seeing an unresponsive board is recoverable by reloading; a
corrupted room is not — but it is a real, if one-time, cost of closing the fallback.
