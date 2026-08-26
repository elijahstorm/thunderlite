# Match seeds

Every match is played under one 32-bit **seed**. Anything random in the game is a
draw from it: the CPU's tie-breaking between near-equal plans, a `random unit`
reinforcement wave in a level script, and whatever seeded mechanics come next.

Implementation: [`src/lib/Engine/matchSeed.ts`](../src/lib/Engine/matchSeed.ts).

## Why one number

Three things fall out of making the seed explicit and stored rather than calling
`Math.random()` where randomness is needed:

- **Every client agrees.** In an online room the seed lives on the room row, so a
  player who rejoins mid-match draws what everyone else drew. This is load-bearing
  for scripted maps: script beats (spawns, terrain swaps, funds) bypass the action
  log entirely, so two clients rolling different reinforcements would silently fork
  the boards with nothing in the log to reconcile them.
- **A match resumes as itself.** A campaign level's seed rides in its save, so
  Continue picks the same match back up, with the same waves still ahead of it.
- **A finished match can be reviewed.** The seed is stamped onto the `matches` row,
  so a replay reconstitutes the rolls the players saw.

## Where a seed comes from

`resolveMatchSeed({ seed, gameSession })`, in priority order:

| Situation                                    | Seed                                                         |
| -------------------------------------------- | ------------------------------------------------------------ |
| Online room                                  | `game_room.seed`, chosen at room creation                    |
| Online room created before seeds were stored | hash of the session id (every client derives the same value) |
| Campaign, Continue                           | the seed in the campaign save                                |
| Campaign, fresh start or Restart             | a new random seed                                            |
| Hot seat, editor "play this map", dev routes | a new random seed                                            |
| Replay                                       | `matches.seed`, falling back to the session-id hash          |

The rule of thumb: **a stored seed always wins; anything with no room and no save
rolls fresh.** That last part is the point. A placeholder session id (`ephemeral`,
`testSession`) is reused verbatim by every offline match, so hashing it would make
every playthrough of a level identical — which is what campaign levels used to do.

A rematch is a new match and takes a new seed: online it creates a new room, and
the in-place hot-seat rematch rolls one explicitly.

## Storage

```sql
alter table game_room add column if not exists seed bigint;  -- chosen at creation
alter table matches   add column if not exists seed bigint;  -- stamped at result time
```

See [`create_game_seed.sql.ts`](../src/lib/Migrations/create_game_seed.sql.ts).
Online results read the seed off the room row rather than the payload: every
client shares it, so there is no claim worth trusting. Hot-seat and campaign
results send their own, which only ever describes that one private match.

The campaign save carries `seed` as of schema v2. v1 saves are rejected on load
rather than resumed under a freshly rolled seed, which would hand the player a
different match than the one they left.

## Drawing from it

```ts
import { SeedStream, matchRandom } from '$lib/Engine/matchSeed'

const roll = matchRandom(SeedStream.ScriptSpawn, line, team)
```

Two rules:

1. **Claim a stream name.** One seed serves unrelated consumers, and two features
   that happened to draw on the same coordinates would move in lockstep. The stream
   name is mixed into the key, so each consumer gets an independent sequence. Add
   new ones to `SeedStream`.
2. **Pass coordinates that identify the decision**, not a running counter — a turn
   number, a tile index, a script line. Draws are stateless: `matchRandom` is a pure
   function of the seed and the coordinates, never of how many draws came before.

Rule 2 is what makes the system usable. Because a draw does not depend on call
order, two places can independently resolve the same thing and agree — the spawn
telegraph resolves a reinforcement a turn before the runner fires it, and a script
re-parsed after a page reload lands on the answer already shown. A stateful
generator would need both to draw in the same order, which is not a property
anything here could guarantee.

The CPU planner (`cpuAi/rng.ts`) draws un-namespaced for historical reasons: it was
here first and its regression suite is pinned to that exact sequence. New systems
take a stream name.

## Testing

The seed defaults to `0` when nothing installs one, so headless tests are
reproducible for free. To pin a specific outcome, install a seed and restore the
default afterward:

```ts
afterEach(() => setMatchSeed(0))

it('does the thing', () => {
	setMatchSeed(1234)
	// ...
})
```

Sweep a range of seeds rather than trusting one when asserting that something holds
for _all_ rolls — see `tests/trench-warfare-level.unit.test.ts`.
