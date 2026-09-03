# CPU AI: time-boxed lookahead (built 2 Sep 2026)

The CPU used to be depth 1: score every legal plan for every unit against the board as it
stands, commit one, repeat. It now has an optional chess-engine style **iterative-deepening
search over whole turns** with a time budget, and a `/dev/playtest` page to tune it on.
Everything in the original plan (M0–M6, transport T1–T3) has landed; the greedy policy is
still the shipped default until the playtest says otherwise.

## What is left

- **Tune, then decide the default.** Run batches on `/dev/playtest` (search vs greedy across
  scenes, fog on and off). The `recruit` preset (greedy) is the default everywhere; flipping
  it is a one-line change in `cpuAi/presets.ts` (`DEFAULT_CPU_PRESET`).
- **Wire presets to content.** `GameStateManager` takes a `cpuPreset` prop and there is a
  `cpuPresetOverride` store, but nothing in campaign levels or room settings picks one yet.
- **Open questions were decided by default, not by Elijah** (revisit if play feels wrong):
  paranoid FFA (all rivals fold into one opponent, proximity-weighted); the opponent's reply
  is generated on the CPU's *believed* board (never peeks fog); ~1.5 s live budget, scaled
  down with army size, capped at 10 s; no Worker thread (the store-based engine would need a
  `GameState` parameter threaded through every scorer first).
- **Nice-to-haves not built:** aspiration windows (a cut-off iteration is simply discarded),
  the marked-loud rule for "stay airborne" ferries (they are quiet lines today), a per-seat
  difficulty in room settings.

## How it works

- **Weights** — `cpuAi/weights.ts`. Every tuning constant, old names kept. Scorers read
  `W.X` at call time; `setCpuWeights` / `resetCpuWeights` drive the playtest sliders.
- **Simulation substrate** — `shadowStore.ts` + `cpuAi/sim.ts`. `gameState` and `smokeTiles`
  are *shadowable* stores: `withSimulated(board, fn)` installs a clone, runs `fn` to
  completion, lifts the shadow. Nothing inside (applyAction, endTurn, scorers, memos) can
  touch the live match or notify the HUD. Rule: never `await` while a shadow is up.
  `believedSnapshot(map, team)` is a clone with concealed enemies removed.
- **Evaluator** — `cpuAi/evaluatePosition.ts`. Believed strength (the results-chart metric,
  fog-respecting) minus rivals, minus fog-hunch phantom value, plus the sum of
  `scorePositionBonus` over own units, an income tempo term, and a ±1e6 terminal.
- **Search** — `cpuAi/search.ts`. A node is the board after a whole team turn. Turn plans
  are *overrides on greedy*: plan 0 is pure greedy; the others force one or two contact units
  onto their 2nd/3rd choice, the best plan of another kind, or the safest reachable tile,
  with everyone else still greedy. Alpha-beta over B plans (B_opp for the reply), a
  `boardDigest` transposition table, quiet lines not extended past the reply, root plans far
  below greedy not deepened, and iterative deepening that only adopts a *complete* iteration.
  Budgets are `{ nodes }` (reproducible) or `{ ms }`; a generator core with sync and
  yielding async drivers; its own draws use `SeedStream.CpuSearch`.
- **Live policy** — `cpuAi.ts`: `runCpuTurn({ policy: 'search', search, fast, onSearch })`.
  The search runs on the first tick, then each tick dispatches one override through the
  ordinary funnel (relay, collision truncation, animation intact), greedy for the rest.
  Hidden tab: 200 nodes, no yielding. A dispatch that lands differently than planned drops
  the rest and re-searches with the remaining budget.
- **Presets** — `cpuAi/presets.ts`: Recruit (greedy), Veteran (depth 2, 1 s), Commander
  (depth 3, 1.5 s).
- **Transport** — the CPU lands loaded carriers, air-lifts (lift → fly → land in one turn),
  ships out from Ports and boards idle Transporters (`candidates.ts`
  `generateCarrierPlans` / `generateTransportPlans`). `ferryGain` in `evaluate.ts` is a
  multi-source Dijkstra from every objective in the passenger's own move costs, which is
  what lets the planner see a strait that Manhattan distance hides.
- **Dev tooling** — `/dev/playtest` (seats, knobs, sliders, telemetry, eval overlay,
  momentum chart) and `Dev/aiBatch.ts` (seeded headless matches behind the shadow).
- **Side fix worth knowing** — `threatToTile` had read enemies' attack lists, which only
  name tiles a target already stands on, so the position scorer's threat term was zero for
  every empty destination. It now uses stationary reach geometry; the CPU holds at contact
  instead of over-walking into a line.

Tests: `tests/Engine/cpuAi{Transport,SimSubstrate,EvaluatePosition,Search,SearchPolicy,PresetsBatch}.unit.test.ts`.
