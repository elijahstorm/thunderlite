# CPU AI: time-boxed lookahead (plan, not yet built)

The CPU today is **depth 1**: each tick it scores every legal plan for every unit against
the board as it stands, picks one unit's plan, commits it, and repeats until nothing is
left to do. It never asks "and then what does the opponent do?". This plan describes how
to add a chess-engine style **iterative-deepening search with a time budget** that
returns the best line found when the clock runs out, and the **/dev playtest page** we
tune it on before it ships to players.

The governing constraint: a tactics grid has a branching factor that dwarfs chess. A
"move" here is a whole team turn (N units x reachable tiles x actions, plus builds), so
the search must be **intentionally lossy**: heuristics decide which few lines get looked
at, and the greedy depth-1 answer is always the floor we fall back to.

## 0. Where things live today

- Turn loop, dispatch, cancel, plan cache: `src/lib/Engine/cpuAi.ts` (`runCpuTurn`,
  `tick`, `pickBestPlan`, `dispatch`, `commit`, `finish`, `LAZY_PLAN_THRESHOLD = 70`)
- Candidate enumeration + per-unit choice: `src/lib/Engine/cpuAi/candidates.ts`
  (`generatePlansFor`, `bestPlanFor`, `PLAN_TEMPERATURE` etc.)
- Scoring heuristics (the eval, ~26 private weight consts): `src/lib/Engine/cpuAi/score.ts`
  (`scorePositionBonus` is a flat sum of 15 terms; `scoreAttack`, `scoreCapture`, ...)
- Eval primitives: `src/lib/Engine/cpuAi/evaluate.ts` (`unitValue`, `buildingValue`, `threatToTile`)
- Builds: `src/lib/Engine/cpuAi/production.ts` (`pickBuildOnce`, `rankBuildableTypes`)
- What the AI is allowed to know: `cpuAi/fogMemory.ts`, `cpuAi/stealthMemory.ts`,
  `visibility.ts#concealedEnemyTiles` (threaded through every scorer as `concealed`)
- Determinism: `cpuAi/rng.ts` (`cpuRandom`, `sampleByScore`, stateless), `matchSeed.ts`
  (`SeedStream`); rules in `.claude/randomness-and-seeds.md`
- Per-tick memo: `cpuAi/planningContext.ts` (single-slot `ctx`, keyed by map reference)
- Headless CPU-vs-CPU driver that already exists, but only in a test:
  `tests/Engine/cpuAiSim.unit.test.ts#runCpuTurnSync`
- Board-position "score" already used by the UI: `src/lib/Engine/matchTimeline.ts`
  (`sampleTeams`, `metricValue`) and `boardDigest.ts` for hashing a board
- Dev vehicle for AI-vs-AI: `src/lib/Dev/DevMatch.svelte` (`localTeam = -1` spectates),
  `DevMatchInspector.svelte`, `devScenes.ts`, registry `devPages.ts`
- Online: only the driver client runs the AI and relays each action (`turnOwnership.ts`,
  `aiTeams` / `isAiDriver` in `GameStateManager.svelte`); watchdog `AI_STALL_TIMEOUT_MS = 45_000`

## 1. What blocks a lookahead right now

1. **`gameState` is a module-global store**, read by candidates/production/growth/fog
   memory and written by `applyAction` (`markTileActed`, money, surrender). There is no
   way to evaluate a hypothetical board without touching the live match.
2. **`map.layers` is mutated in place** everywhere. `structuredClone(map.layers)` is the
   established snapshot idiom (ReplayViewer, GameStateManager rematch, campaign save).
   `structuredClone(map)` throws: `filters` holds functions, overlays hold Sets.
3. **`planningContext` is single-slot.** A nested `beginCpuPlanning` on a clone would
   clobber the parent tick's context.
4. **Side effects on apply**: `devLog.recordAction` on every `applyAction` in dev,
   `animateExplosion` inside `endTurn`, `applyWinConditions` on the real board.
5. **No time budget exists anywhere.** Pacing is animation-driven; `schedule` is a
   150ms `setTimeout` (microtask when the tab is hidden).
6. **Weights are private consts** scattered across seven files. Nothing can be tuned
   from outside without editing source.

## 2. Design principles

- **Turn plans are the unit of search, not unit moves.** A node is "the board after a
  whole team turn". Depth counts half-rounds: d1 = my turn (today's greedy), d2 = my
  turn then their best reply, d3 = plus my next turn.
- **Beam everything.** Never enumerate a full turn's cross product. Per unit keep the
  top K plans by the current heuristic; assemble at most B distinct turn plans per node.
- **Greedy is the floor.** Iterative deepening starts by committing to the depth-1
  answer. Deeper results only replace it when a full iteration completes (or, later,
  when an aspiration window confirms the partial result).
- **The search never cheats fog.** Nodes are built on the CPU's *believed* board:
  concealed enemies absent, phantom heat present. The opponent model sees what the
  CPU can see of itself, nothing more.
- **Interruptible and yielding.** Runs in slices between `await` yields so the UI
  never freezes; honours `cancel()`, `stillOurTurn()`, the 45s stall watchdog, and the
  hidden-tab path (tiny budget, no animation).
- **Deterministic under a node budget, time-boxed in production.** Tests and replays
  of the search use `{ nodes }`; live play uses `{ ms }`. Cross-machine determinism is
  not required: online, only the driver runs the AI and relays actions; replays follow
  the log.
- **Emit `SerializedAction`s one at a time** through the existing `dispatch` /
  `commit` funnel so relay, collision truncation, sync-lock and animation stay intact.
  If a dispatched action lands differently than the plan assumed (route truncated by a
  hidden unit), re-plan the rest of the turn with the remaining budget.

## 3. Architecture, in build order

### Phase A: extract weights (no behaviour change)

New `src/lib/Engine/cpuAi/weights.ts`: one exported `DEFAULT_WEIGHTS` object holding
every tuning const from score.ts, candidates.ts, production.ts, growth.ts, cpuAi.ts,
fogMemory.ts, stealthMemory.ts, with the same names. A module-level `weights` getter
plus `setCpuWeights(partial)` / `resetCpuWeights()` for the dev page. Every scorer reads
through it. Pin with the existing `cpuAiSim`, `cpuAiVariation`, `cpuAiTradeValuation`
tests so this step is provably a no-op.

### Phase B: headless simulation substrate

New `src/lib/Engine/cpuAi/sim.ts`:

- `SimBoard = { layers: MapLayers; state: GameState }`, built by `snapshot(map)` (clone
  layers, clone state incl. `actedTiles` and the fog/stealth memory on players).
- `withSimulated(board, fn)`: installs `board.state` into the `gameState` store and a
  `MapProcesser`-shaped `{ cols, rows, layers, funds, fog }` wrapper, runs `fn`, then
  restores the live store and returns the mutated snapshot. Save/restore is the
  pragmatic first cut; threading a `GameState` parameter through every scorer is the
  cleaner follow-up and can be done incrementally behind the same helper.
- `ApplyActionOptions.simulated?: boolean`: skips `recordAction`, `animateExplosion`
  in `endTurn`, `panBoardToBuiltUnit`, and anything else that reaches the DOM or the
  outgoing relay. `live` already gates SFX, stats and the timeline.
- `planningContext`: make `ctx` a stack (push on `beginCpuPlanning`, pop on end) so a
  nested plan on a clone cannot clobber the parent.
- Promote `runCpuTurnSync` from `tests/Engine/cpuAiSim.unit.test.ts` into `sim.ts` as
  `playGreedyTurn(board, team)`: the depth-1 policy run headless on a snapshot. The test
  keeps using it.
- Tests: a simulated ply leaves `gameState` and `map.layers` byte-identical (compare
  `boardDigest` before/after); nested planning contexts do not interfere.

### Phase C: the evaluation function

New `src/lib/Engine/cpuAi/evaluatePosition.ts`, `evaluatePosition(board, cpuTeam) -> number`.

This is where the UI's strength score comes in (Elijah's question: yes, reuse it). The
material core is exactly `matchTimeline.sampleTeams` (army = unit cost x hp%, funds,
properties), which players already see on the results chart and in the replay bar, so
the AI optimising it is legible: "the CPU plays to move that bar". Two changes make it
a legal evaluator:

1. **Fog-respecting variant** `sampleBelievedTeams(board, observer)`: enemy units count
   only where `!concealed.has(tile)`; add `phantomThreatAt` heat as a discounted
   expected enemy value so a blank fog region is not read as "no enemy". Own side is
   always fully known.
2. **Beyond material**: material alone is flat inside a turn (moving a unit changes
   nothing). Add the aggregate of the existing `scorePositionBonus` over own units
   (positional pressure, cover, cohesion, objectives), a tempo term (income per turn x
   `BANK_HORIZON`), and a win/loss terminal (`evaluateWinConditions` on the snapshot,
   +/- a huge constant). Weights live in `weights.ts` so the sliders reach them.

Score = believed strength(me) minus the strongest believed enemy (2-player) or the sum
of enemies weighted by `1 / distance` (FFA, see open questions), plus the positional and
tempo terms. Tests: a hidden enemy does not change the eval; killing a unit raises it by
its value; the terminal dominates.

### Phase D: the search

New `src/lib/Engine/cpuAi/search.ts`, `searchTurn(board, cpuTeam, budget) -> TurnPlan`.

- **Turn-plan generation** (the move generator, the whole game lives here):
  - Per unit: `generatePlansFor` then keep top **K = 3** by heuristic score, always
    including the greedy best.
  - Units farther than `CONTACT_RADIUS` from any visible enemy or objective are frozen
    to their greedy plan and never branched (they are travel, not tactics).
  - Assemble **B = 8** turn plans: plan 0 is pure greedy; plans 1..B-1 come from
    "swap one contact unit to its 2nd/3rd choice" ordered by score gap, then from
    seeded sampling with `sampleByScore` on a claimed `SeedStream.CpuSearch`.
  - Order-independence: apply unit plans in a canonical order (tile index) so two
    turn plans that differ only in ordering hash to the same `boardDigest` and the
    transposition table dedupes them.
  - Builds stay greedy inside the tree (`pickBuildOnce`); only the root branches on
    its top-2 build choices.
  - Each turn plan ends with a simulated `end-turn` so income, Start_Turn hazards and
    captures land before the eval.
- **Opponent reply**: same generator with a narrower beam (**B_opp = 3**), run on the
  CPU's believed board. The opponent's unknown units are simply absent; the phantom
  term in the eval is what keeps the CPU honest about that.
- **Algorithm**: iterative deepening, depth 1 → maxDepth (default 3). Alpha-beta over
  the B plans, move ordering from the previous iteration, `boardDigest` transposition
  table per search. Every full iteration overwrites `best`; a cut-off iteration is
  discarded (aspiration windows can come later).
- **Budget**: `{ ms }` or `{ nodes }`. Default live budget ~1500ms per turn, scaled
  down as unit count rises (above `LAZY_PLAN_THRESHOLD` skip search entirely and stay
  greedy). Hidden tab: `{ nodes: 200 }`. Hard ceiling well under the 45s watchdog. The
  clock is checked between nodes; the search yields to the event loop every ~16ms via
  `await` on a `MessageChannel` tick so the turn banner and board keep painting.
- **Execution**: `runCpuTurn` gets a `policy: 'greedy' | 'search'` option (and per-seat
  config later). With `search`, the tick asks `searchTurn` for the root turn plan, then
  dispatches its unit plans one by one through the existing `dispatch`. After each
  dispatch, if the board digest differs from what the plan predicted, drop the rest and
  re-search with whatever budget remains (minimum: greedy).
- **Determinism**: claim `SeedStream.CpuSearch`; never extend `cpuRandom` coordinates
  (the variation suite is pinned to them). Node-budget runs are fully reproducible.
- **Difficulty**: `{ depth, ms, K, B, temperature }` presets (Recruit = greedy, Veteran =
  d2, Commander = d3). Campaign levels and room settings pick a preset; default stays
  greedy until the playtest says otherwise.

### Phase E: /dev/playtest

`src/routes/dev/playtest/+page.svelte` (+ the usual dev-gated `+page.ts`, and a
`devPages.ts` entry tagged `ai`). Built on `DevMatch` + `DevMatchInspector`.

Controls (one row of panels beside the board):

- **Scene**: any `devScenes` entry, plus fog on/off and a seed field (reproduce a run).
- **Seats**: per team, `Human | Greedy | Search`. `localTeam = -1` to spectate AI vs AI.
- **Search**: depth cap, time budget (ms), node budget (for reproducible runs), K, B,
  B_opp, contact radius, temperatures, hidden-tab simulation toggle.
- **Weights**: sliders for every entry in `weights.ts`, grouped by file, with reset and
  copy-as-JSON so a good set can be pasted back into `DEFAULT_WEIGHTS`.
- **Speed**: normal / no animation (the hidden-tab path) so a full match runs in seconds.
- **Batch**: "run N matches headless" through `sim.ts` (greedy vs search, search vs
  search with two weight sets), tallying wins, average rounds, average final strength
  gap, nodes/sec, depth reached. This is the tuning loop.

Readouts:

- **Search telemetry** per CPU turn: nodes, depth completed, ms used, root plans
  considered, the chosen line with its eval, and the greedy plan's eval for comparison.
- **Eval overlay**: paint `map.debugHeat` with the eval delta of each candidate
  destination for the selected unit (the same hook `/dev/ai` uses today).
- **Momentum chart**: `HUD/ScoreTimeline.svelte` fed from the live `matchTimeline`
  store (GameStateManager already records it), so a tuning run shows the same curve a
  player would see on the results screen. Add a second chart of eval-vs-actual to catch
  an evaluator that is confidently wrong.

## 4. Pruning heuristics, listed so we stay intentional

| Heuristic | Why it is safe |
|---|---|
| Top-K plans per unit (K=3) | The heuristic already ranks well at depth 1; the search corrects ordering among good plans, not among bad ones. |
| Freeze non-contact units to greedy | Their move has no interaction with the enemy this turn. |
| B turn plans per node, B_opp narrower | Opponent reply only needs to punish, not to be optimal. |
| Canonical unit order + transposition table | Turn plans commute when units don't interact. |
| Builds greedy below the root | Production is a strategic knob; the tactical tree should not multiply by it. |
| Extend only "loud" lines past depth 2 | Quiet plans (no attack/capture) rarely need refutation; spend the budget on fights. |
| Eval margin cut | Discard root plans worse than greedy by more than `SEARCH_MARGIN` before deepening. |
| Skip search above `LAZY_PLAN_THRESHOLD` | Large boards already strain depth 1; greedy plus the plan cache is the right tool there. |

## 5. Milestones (progress commit at each)

1. **M0 weights extraction**: `weights.ts`, all consts routed, existing suites green.
2. **M1 sim substrate**: `sim.ts`, `simulated` opt, context stack, promote
   `runCpuTurnSync`; tests prove the live store and board are untouched.
3. **M2 evaluator**: `evaluatePosition` with fog-respecting material; tests above.
4. **M3 depth-2 search under a node budget**: `search.ts`, `policy` option on
   `runCpuTurn`, sim test: search beats greedy over 20 seeded Skirmish games by a
   margin we decide (open question).
5. **M4 time budget + yielding + cancel**: live-play integration, hidden-tab test,
   watchdog test, re-plan-on-divergence test.
6. **M5 /dev/playtest**: controls, telemetry, batch runner, charts.
7. **M6 ship gate**: presets, campaign/room wiring behind a flag, default still greedy
   until batch results and a human playtest say otherwise.

## 6. Open questions for Elijah

- **Budget**: is ~1.5s of thinking per CPU turn acceptable in campaign? Online CPU seats
  run on the driver's machine; should they get less?
- **FFA**: paranoid minimax (all other teams collapse into one opponent) or max^n
  (each team maximises its own eval)? Paranoid is cheaper and safer to start.
- **Opponent model**: believed board only (recommended), or let the opponent reply
  with its true units (stronger, but the CPU is then effectively peeking)?
- **Worker thread**: the global-store design rules it out today. Worth planning the
  `GameState` parameter threading (Phase B follow-up) so a Worker becomes possible?
- **Player-facing difficulty**: expose presets in room settings, or keep it per campaign
  level only?

## 7. Risks

- Store save/restore around simulation is fragile if any scorer caches by map
  reference across ticks (`fogMemory.visCache` does, keyed on map ref + turn + acted
  count). Snapshots must use a fresh wrapper object per node.
- Temperature draws keyed on *counts* (`units.length`, `producers.length`) shift as the
  search changes what remains; keep the search's own draws on `SeedStream.CpuSearch`.
- Memory: a clone of a 500-tile board is small; the transposition table must be bounded
  per search (clear between turns).
- Any leak of a simulated action into `emitOutgoingAction` desyncs an online room.
  `commit` must never be reachable from the search path; only `dispatch` at the root.
