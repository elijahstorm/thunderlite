# Randomness in gameplay (match seeds)

**Never call `Math.random()` for anything a player can see.** Every random outcome in a
match is a draw from one 32-bit **match seed**. If you are adding a mechanic that rolls
dice, shuffles, or picks between options, it goes through this system or it breaks
multiplayer, replays, and campaign resume — all three, silently.

## 0. Where things live

- Seed lifecycle + the draw API: `src/lib/Engine/matchSeed.ts`
- The PRNG core + the CPU's own draws: `src/lib/Engine/cpuAi/rng.ts`
- Installed once per match: `src/lib/Engine/GameStateManager.svelte` (`$effect.pre`)
- Stored: `game_room.seed`, `matches.seed` (`src/lib/Migrations/create_game_seed.sql.ts`)
- Campaign resume carries it: `src/lib/Campaign/campaignSave.ts` (snapshot v2+)
- Worked example: `src/lib/Campaign/randomSpawn.ts` (`random unit` script waves)
- Long-form docs (user-facing): `docs/match-seed.md`, `docs/map-scripting.md`
- Tests: `tests/Engine/matchSeed.unit.test.ts`, `tests/Campaign/randomSpawn.unit.test.ts`

## 1. How to draw

```ts
import { SeedStream, matchRandom } from '$lib/Engine/matchSeed'

const roll = matchRandom(SeedStream.ScriptSpawn, line, team) // → [0, 1)
```

Two rules, both load-bearing:

**Claim a stream name.** Add it to the `SeedStream` object. One seed serves unrelated
consumers, and two features that happened to draw on the same coordinates would move in
lockstep forever. The stream name is mixed into the key so each consumer gets an
independent sequence.

**Pass coordinates that IDENTIFY the decision, not a counter.** A turn number, a tile
index, a script line, a unit id — something stable that names *which* decision this is.
Never a running "how many draws so far" counter.

## 2. Why coordinates, not a counter (the thing that bites)

`matchRandom` is **stateless**: a pure function of (seed, stream, coordinates). It does not
matter how many draws came before. That is not a stylistic preference, it is what makes the
whole system work:

- The spawn telegraph resolves a reinforcement **a turn before** the runner fires it, from
  a completely separate call site. Both must land on the same answer. With a stateful
  generator they'd have to draw in the same order, which nothing can guarantee.
- A page reload re-parses the level script from scratch. The roll must come out the same,
  or the player gets a different wave than the one already shown to them.
- Two clients in an online room draw independently and must agree.

If you find yourself wanting "the next random number", stop — you want a coordinate.

## 3. Where the seed comes from

`resolveMatchSeed({ seed, gameSession })`. **A stored seed always wins; anything with no
room and no save rolls fresh.**

| Situation                                | Seed                                     |
| ---------------------------------------- | ---------------------------------------- |
| Online room                              | `game_room.seed`, set at room creation   |
| Online room predating seeds              | hash of the session id (all clients agree) |
| Campaign → Continue                      | the seed in the campaign save            |
| Campaign → Restart / fresh, hot seat, editor, dev routes | fresh random    |
| Replay                                   | `matches.seed`, falling back to session hash |

Rejoining a room keeps the seed. A rematch takes a new one (online it's a new room; the
in-place hot-seat rematch rolls one explicitly).

### The trap this replaced

Campaign and every dev/editor route pass `gameSession = 'ephemeral'` — a literal reused by
every offline match. The old code hashed it, so **every campaign level played identically
forever** and the random fallback was unreachable. `PLACEHOLDER_SESSIONS` in `matchSeed.ts`
exists solely to stop that. If you add another placeholder session id, add it there too, or
you have silently reintroduced the bug.

## 4. Why it has to be shared and stored

- **Online agreement.** Script beats (spawns, terrain swaps, funds) mutate the board
  *outside* the action log — see the header comment in `campaignSave.ts`. If two clients
  rolled different reinforcements, their boards fork with nothing in the log to reconcile
  them. A scripted map played online is the sharp case.
- **Resume is the same match.** The campaign snapshot carries `seed`; `applySnapshot`
  re-installs it before the live match is wired up. v1 saves (no seed) are *rejected* on
  load rather than resumed under a rolled seed.
- **Review.** `matches.seed` is stamped at result time so a replay reconstitutes the rolls
  the players saw. Online results read it **off the room row, never the payload** — every
  client shares it, so there is no claim worth trusting. Local results send their own.

## 5. The CPU is a deliberate exception

`cpuRandom(...)` in `cpuAi/rng.ts` draws **un-namespaced** (no stream tag). It predates the
stream system and its whole regression suite — `cpuAiSim.unit.test.ts` and friends — is
pinned to that exact sequence. Adding a tag would shift every CPU test. Leave it. New
systems take a stream name.

## 6. Testing

The seed defaults to `0` when nothing installs one, so headless tests are reproducible for
free. Any test that installs a seed **must restore the default**, or it leaks into the CPU
suite:

```ts
afterEach(() => setMatchSeed(0))
```

When asserting something holds for *all* rolls (e.g. "a spawn tile is always placeable"),
sweep a range of seeds rather than trusting one — `tests/trench-warfare-level.unit.test.ts`
loops `setMatchSeed(0..300)`. Injecting a fake `random` is fine for pinning one exact
outcome (`resolveRandomSpawn` takes one), but it is not a substitute for the sweep.

## 7. Adding a new seeded mechanic — checklist

1. Add a name to `SeedStream`.
2. Draw with `matchRandom(name, ...identifying coordinates)`.
3. Ask: **does anything else need to independently reach the same answer?** (a UI preview,
   a telegraph, the CPU planner, another client). If yes, make sure both sides derive the
   same coordinates — do not resolve early and pass the answer around unless it also gets
   persisted.
4. If it must survive a page reload mid-match, confirm the coordinates come from durable
   data (script line, tile, turn), not from mount-order state.
5. Test with a seed sweep, and restore `setMatchSeed(0)`.

## 8. Deploy note

Room creation inserts `seed`, so **`pnpm migrate` must run before deploying** code that
touches it. Rooms already in flight have `seed IS NULL` and fall back to the session-id
hash — the same value the pre-seed code used — so they finish out consistently across the
deploy instead of forking mid-match.
