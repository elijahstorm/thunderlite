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

| Block | Fires |
| --- | --- |
| `<start> … </start>` | Once, when the map loads. |
| `<turn N> … </turn>` | At the start of round `N` for **team 0** (the player). Shorthand for `<turn N,0>`. |
| `<turn N,T> … </turn>` | At the start of round `N` for team `T`. |
| `<win> … </win>` | Once, when the local player wins. |
| `<lose> … </lose>` | Once, when the local player loses or draws. |

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

### `kill unit` — remove a unit

```
kill unit: x,y
```

Removes whatever unit occupies `x,y`, running its death effects and re-checking
win conditions.

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

Sets the weather/sky at `x,y` (e.g. `"Cloud"`, `"Storm"`). Weather affects air
unit concealment and movement drag.

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
move: x,y                          pan camera
hl: x,y                            highlight a tile
unhl: x,y                          remove a highlight
wait: seconds                      pause (decimals ok)
add unit: team,"Name",x,y          spawn a unit
kill unit: x,y                     remove a unit
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
