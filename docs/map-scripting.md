# Map scripting

ThunderLite maps can carry a **script** — cutscene-style logic that runs while
the map is played. Scripts drive dialogue, the camera, spawns, weather, funds,
and win/lose flow. The same language powers the story-mode campaign levels, so
anything a campaign level does, an editor-authored map can do too.

You can edit a map's script from the map editor: open a map, click **Script** in
the toolbar, and write the script in the modal. It validates as you type and
shows the line number of any error. The script is saved, shared, and played
along with the map (it round-trips through the map hash, the same as terrain and
units).

This document is the complete reference for the script language.

---

## Structure: blocks

A script is a list of **blocks**. Each block fires at a specific moment in the
match. Commands inside a block run top-to-bottom, one after another; a command
that pauses (`talk`, `wait`) blocks the ones after it until it finishes.

| Block                  | Fires                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `<start> … </start>`   | Once, when the map loads.                                                          |
| `<turn N> … </turn>`   | At the start of round `N` for **team 0** (the player). Shorthand for `<turn N,0>`. |
| `<turn N,T> … </turn>` | At the start of round `N` for team `T`.                                            |
| `<win> … </win>`       | Once, when the local player wins.                                                  |
| `<lose> … </lose>`     | Once, when the local player loses or draws.                                        |

Rounds and teams are **zero-based**. One round covers every team's side-turn, so
a 2-team match runs `<turn 0,0>` (player's first turn), then `<turn 0,1>` (the
opponent's first turn), then `<turn 1,0>`, `<turn 1,1>`, and so on. Each block
fires at most once.

Blocks cannot be nested. Any command must live inside a block.

```
<start>
  move: 4,4
  talk Commander: "Hold this ridge until reinforcements arrive."
</start>

<turn 2,1>
  add unit: 1,"Strike Commando",8,2
  talk Enemy: "More of them. Push forward!"
</turn>

<win>
  talk Commander: "The ridge is ours. Well fought."
</win>

<lose>
  talk Commander: "We've lost the ridge. Regroup and try again."
</lose>
```

### Victory and defeat

Win/lose conditions themselves are evaluated by the engine (eliminate the enemy,
lose your command center, etc.) — the `<win>` and `<lose>` blocks are what
**plays** when those outcomes happen. Use them for closing dialogue, a final
camera move, or a cleanup spawn.

### Timed and triggered events

`<turn N,T>` blocks are how you schedule things by time: reinforcements that
arrive on round 3, a storm that rolls in on round 5, a funds bonus at the start
of the player's second turn, and so on.

### Conditional triggers — `<when>`

```
<when COND>
  …commands…
</when>
```

A `<when>` block fires **once**, the first time its condition becomes true
(checked at the start of each side-turn). Use it to react to the state of the
battle rather than the clock — for example, springing a second phase once the
enemy's first wave is destroyed, ending the match the moment the player loses
a key unit, or acknowledging a capture the moment a team takes a building. The
condition counts a team's units or its owned buildings:

```
team <N> units <op> <K>                          whole-team unit count
team <N> units "Name"[,"Name"…] <op> <K>         count of just those unit types
team <N> buildings <op> <K>                      count of owned buildings
team <N> buildings "Name"[,"Name"…] <op> <K>     count of just those buildings
```

`<op>` is one of `< <= == >= >`. Examples:

```
<when team 1 units <= 2>           # the enemy is down to its last two units
  talk Vance: "Their assault is spent. Push for the capital now."
  terrain: "Road",9,3              # blast open a path
  add unit: 1,"Stealth Tank",10,2  # a fresh defender
</when>

<when team 0 units "Strike Commando","Heavy Commando" == 0>
  talk Vance: "Both commandos are gone. We can't take the objective."
  defeat                           # force a loss (see below)
</when>

<when team 0 buildings "Air Control" >= 1>
  talk Vance: "The airfield is ours. The factory can build aircraft now."
</when>
```

Tip: to make a unit's loss matter without it auto-winning, keep the enemy alive
some other way (a sealed garrison, a separate force) so reaching zero of one
group triggers your `<when>` instead of the engine's default rout win.

---

## Coordinates

All positions are **tile coordinates**, `x,y`, zero-based, measured from the
top-left of the map. `x` is the column, `y` is the row. They must be
non-negative integers. A command targeting an off-map tile is simply ignored at
runtime.

---

## Commands

Every command is a single line of the form `keyword: arguments` (some use a
`keyword qualifier: arguments` form, like `add unit:`). Names for units,
buildings, terrain, and weather must be **quoted** and must match an entry in the
game data exactly (they are validated when the script is parsed).

### `talk` — dialogue

```
talk <Speaker>: "line one", "line two", …
```

Shows a dialogue overlay attributed to `<Speaker>` and pauses the script until
the player advances past the last line. The quoted argument list may span
multiple physical lines.

```
talk Vance: "Reyes, over here.", "Kael's scouts caught your patrol off guard."
```

### `color` — set a speaker's dialogue colour

```
color <Speaker>: <hex|name>
```

Sets the colour used for `<Speaker>`'s name, line text, and the dialogue box's
accent border, so it is obvious when a line changes hands. The value is a hex
code (`#ef4444`, `#fff`) or a plain CSS colour name (`teal`, `crimson`). The
colour applies for the rest of the level, so set your cast up once (usually in
`<start>`). Speakers with no `color` keep a sensible default.

```
color Reyes: #4ade80
color Kael: crimson
```

### `move` — pan the camera

```
move: x,y
```

Pans the camera to center on tile `x,y`.

### `hl` / `unhl` — highlight a tile

```
hl: x,y
unhl: x,y
```

`hl` places a tutorial pointer/highlight on a tile; `unhl` removes it. Useful
for drawing the player's attention to an objective or a unit.

### `wait` — pause

```
wait: seconds
```

Pauses the script for `seconds` (decimals allowed, e.g. `wait: 0.5`).

### `add unit` — spawn a unit

```
add unit: team,"Unit Name",x,y
```

Spawns a unit of the named type for `team` at `x,y`, at full health. Re-checks
win conditions afterward.

```
add unit: 1,"Strike Commando",8,2
```

### `random unit` — spawn a seeded-random unit

```
random unit: team,"Name"|"Name" @ x,y|x,y|x,y
```

Like `add unit`, but rolls the unit type and the tile from the two `|`-separated
lists. The lists roll **independently**, so two types times four tiles is eight
possible outcomes off one line, which is what keeps a wave of reinforcements to
one line per turn instead of one line per combination.

```
random unit: 1,"Scorpion Tank"|"Lance Tank" @ 13,2|13,4|11,6
```

**The roll is seeded, not `Math.random`.** It draws from the match's own seed
(see [match-seed.md](./match-seed.md)), keyed by the command's source line.
Consequences worth knowing:

- A replay or review run at the match's seed reproduces the wave exactly, the
  same way it reproduces every CPU decision.
- Online, every client resolves the wave off the room's shared seed. This matters:
  script beats never reach the action log, so clients that disagreed here would
  fork their boards with nothing to reconcile them.
- A campaign level resumed with Continue keeps its seed, so the waves still ahead
  are the ones that attempt was going to get. Restart takes a new seed, so a second
  run of the level plays differently.
- Reloading mid-level re-parses the script but re-rolls to the _same_ answer, so
  a wave already telegraphed to its owner cannot change under them.
- The spawn telegraph resolves the roll a turn early and the runner resolves it
  again when the block fires; both land on the same unit and tile because the
  roll is stateless, not a draw counter.
- Editing the script shifts line numbers, which reshuffles rolls. That is only
  ever a level-design-time change, never a mid-match one.

`random unit` also pans the camera to the tile it rolled, since an author cannot
write a `move:` for a tile they do not pick.

### `kill unit` — remove a unit

```
kill unit: x,y
```

Removes whatever unit occupies `x,y`, running its death effects and re-checking
win conditions.

### `hurt unit` — injure a unit

```
hurt unit: x,y,health
```

Sets the current health of the unit at `x,y` to `health` (clamped to between 1
and the unit's max, so it injures but never kills — use `kill unit` for that).
Handy for a "battle already underway" feel where troops start battered.

```
hurt unit: 9,3,40
```

### `defeat` — end the match as a loss

```
defeat
```

Immediately ends the match as a defeat for the player and plays the `<lose>`
block. Takes no arguments. Almost always used inside a `<when>` block to enforce
a custom failure condition (e.g. losing an escort unit you must keep alive).

### `add building` — place a building

```
add building: team,"Building Name",x,y
```

Places a building of the named type, owned by `team`, at `x,y`. Build
permissions (which unit classes the team may produce) are recomputed
immediately.

Use **team 4** for a **neutral** (unclaimed) building — it belongs to no player,
renders grey, and can be captured by any unit, just like a neutral building
placed in the editor. A neutral building never derives a player and capturing it
never triggers an insta-lose.

```
add building: 0,"Warfactory",5,5
add building: 4,"City",6,6     # neutral, capturable by anyone
```

### `remove building` — remove a building

```
remove building: x,y
```

Removes the building at `x,y` and recomputes build permissions.

### `own building` — change a building's owner

```
own building: team,x,y
```

Transfers the building at `x,y` to `team` (a scripted capture). Build
permissions are recomputed and win conditions re-checked. Pass team 4 to return
a building to neutral.

### `terrain` — change terrain

```
terrain: "Terrain Name",x,y
```

Replaces the ground tile at `x,y`.

```
terrain: "Mountain",3,4
```

### `weather` — set weather

```
weather: "Weather Name",x,y
```

Sets the weather/sky at `x,y`. Weather affects air unit concealment, flight
cost, and end-of-turn damage. Available types:

- `"Cloud"` — hides aircraft, no cost.
- `"Storm"` — hides aircraft, slows flight, 10 damage/turn to aircraft inside
  (Storm Riders are immune to both the damage and the slow).
- `"Turbulence"` — slows flight hard (cost 3), no concealment, no damage.
- `"Ash Plume"` — volcanic ash: hides aircraft and damages them like a storm.
- `"Jetstream"` — fast air (cost 0.5): aircraft riding it fly twice as far.

```
weather: "Storm",6,2
```

### `clear weather` — remove weather

```
clear weather: x,y
```

Removes any weather at `x,y`.

### `fog` — toggle fog of war

```
fog: on
fog: off
```

Turns fog of war on or off for the rest of the match. (The map's starting fog
state is set separately in the editor's **Options → Rules → Fog of war**.)

### `funds` — adjust team funds

```
funds: team,amount
```

Adds `amount` to `team`'s funds. `amount` may be negative to deduct funds; a
team's funds never drop below zero.

```
funds: 0,500
funds: 1,-200
```

---

## Command quick reference

```
talk <Speaker>: "line", "line"     dialogue (pauses)
color <Speaker>: #hex | name       set a speaker's dialogue colour
move: x,y                          pan camera
hl: x,y                            highlight a tile
unhl: x,y                          remove a highlight
wait: seconds                      pause (decimals ok)
add unit: team,"Name",x,y          spawn a unit
random unit: team,"A"|"B" @ x,y|x,y seeded-random spawn (type and tile)
kill unit: x,y                     remove a unit
hurt unit: x,y,health              injure a unit (never kills)
defeat                             end the match as a loss
add building: team,"Name",x,y      place a building
remove building: x,y               remove a building
own building: team,x,y             change a building's owner
terrain: "Name",x,y                change terrain
weather: "Name",x,y                set weather
clear weather: x,y                 remove weather
fog: on | off                      toggle fog of war
funds: team,amount                 adjust team funds (amount may be negative)
```

---

## Notes & gotchas

- **Names are validated at parse time.** A typo'd unit, building, terrain, or
  weather name is a parse error with a line number — fix it before the map will
  play with scripting. The valid names come from the game data tables
  (`src/lib/GameData/`).
- **Teams are zero-based.** Team 0 is the local player; players are teams 0–3.
  Team 4 is the **neutral** owner for buildings (unclaimed, capturable, grey).
- **A malformed script never bricks a map.** If parsing fails, the map plays
  without its script rather than refusing to load — but the editor flags the
  error so you can fix it.
- **Where it's implemented.** Parser: `src/lib/Campaign/cutsceneScript.ts`.
  Event types: `src/lib/Campaign/cutsceneTypes.ts`. Runtime dispatch:
  `src/lib/Campaign/campaignRunner.ts`. Engine-backed effects:
  `src/lib/Campaign/campaignInterface.ts`.
