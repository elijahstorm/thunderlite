# The empty match, and the map the editor quietly erased

**Reported symptom.** Room `h3XftLdnJ4NuMtAC` started with two human players and a
board of nothing but grass: no units, no buildings, no terrain, on both clients.
No console errors, no failed requests, no server errors on either ThunderLite or
the DontCode gateway. Every request answered 200.

**Verdict.** Two separate faults, in sequence.

1. The **map editor silently overwrote map `0j981o7uXcUs` with a blank board** a
   few minutes before the match. The user loaded a working map, turned fog of war
   off, and saved. The canvas kept showing the real board the whole time; the
   object that got serialized was a different, empty one.
2. The **match then started on that blank map without a single complaint**,
   because every layer between "map has no sides" and "board on screen" treats
   that as a degrade case and falls back.

The runtime was never wrong. It rendered exactly what was stored.

---

## 0. The evidence

`maps` row `0j981o7uXcUs`, decoded from `map_data`:

```
public_id: 0j981o7uXcUs   name: "Unnamed Map"   status: public
created 2026-08-24T11:08:12Z   updated 2026-08-25T05:35:55Z
cols x rows: 10 x 10
units: 0    buildings: 0    sky: 0    fog: false
ground histogram: { 0: 100 }        // 100 tiles, all type 0 = grass
```

That is the editor's `EMPTY_MAP` default (title `Unnamed Map`, 10x10, all grass)
with one edit applied: `fog: false`. The fog toggle is the user's; the board is
not theirs.

Room `h3XftLdnJ4NuMtAC` was created at `start_at` 1787636197486, which is
2026-08-25T05:36:37Z — 42 seconds after the overwrite.

The stored thumbnail (`maps/0j981o7uXcUs.png`, re-uploaded by the same save) is a
320x320 image of plain grass. `persist()` renders the thumbnail from the same
`map` object it hashes, so this confirms the object was already blank at save
time rather than something going wrong in the hash worker. It looked unchanged in
the UI only because the thumbnail URL is stable per map id, so browsers served
the cached old image.

---

## 1. How the editor blanked the map

Three mechanics compound. Each is defensible alone.

### 1a. `mapStore` outranks the route

`MapEditor` reads its board once, at mount:

```js
let map = $state.raw(untrack(() => $mapStore ?? deriveFromHash(mapHash)))
let currentMapId = $state(untrack(() => mapId ?? (...)))
```

`mapStore` is module state, so it survives client-side navigation. `mapHash` is
only consulted when the store is empty. `currentMapId` has no such deference: it
takes the id straight from the route.

So an in-memory board from one map can be paired with a different map's id.

### 1b. The bare `/editor` route hands one over

```js
if (!mapId && !loadDraft(undefined)) {
	const lastId = getLastActiveMapId()
	if (lastId) {
		goto(`/editor/${lastId}`, { replaceState: true })
		return
	}
}
```

Opening bare `/editor` mounts a **blank** board, publishes it to `mapStore` via
the `$effect.pre` a few lines below, and then client-side-navigates to the last
map you worked on. The `[id]` page mounts, finds `$mapStore` populated, and
adopts the blank board while taking `0j981o7uXcUs` as its id. `resumedFromMemory`
is true, so draft recovery is skipped and nothing says a word.

The debounced autosave then writes that blank board into the draft slot keyed by
the real map's id, so the state persists into later sessions.

### 1c. Reassigning `map` did not repaint the canvas

This is why it was invisible. `MapEditor` documents the hazard itself:

> reassigning `map` changes the prop identity flowing into
> MapRender -> Game -> TileSelector -> Scroller, which desyncs the Scroller's
> mount-time render closures

`MapRender` was not keyed on `map`, so after any post-mount reassignment (draft
recovery, resize apply, "New map") the canvas kept painting the object it mounted
with. The editor showed one board and saved another. Add the same-URL cached
thumbnail and there was no visible signal anywhere.

The fog toggle then operated on the blank board (hence `fog: false` on an
otherwise pristine `EMPTY_MAP`), `apply()` set it as `map`, and Save wrote it.

---

## 2. Why the match started anyway

A zero-team map degrades silently through every layer, and the room's own records
show each step.

1. `teamsFromHash` finds no players and returns `[]`. No throw.
2. `seatsForMap` returns `null`; `/api/game` read that as "couldn't read the map"
   and opened a room at `DEFAULT_MAX_PLAYERS`. The row has `max_players: 2`.
3. The lobby filled, both players readied, the countdown armed.
4. `/play` gates team assignment on `if (teams.length)`, so
   `assignTeamsIfNeeded` and `seedFirstTurn` never ran. The surviving
   `game_member` row still reads `team: null`.
5. `localTeam` fell back to `teams[seat] ?? 0`. **Both players commanded team 0.**

The event log is exactly what that predicts:

```
seq 0  P1  end-turn  next: 0
seq 1  P2  end-turn  next: 0
seq 2  P1  end-turn  next: 0
seq 3  P1  surrender team: 0
seq 4  P1  surrender team: 0
seq 5  P1  surrender team: 0
seq 6  P1  surrender team: 0
seq 7  P1  surrender team: 0
```

The turn pointer can only ever hand back to team 0, and surrender never resolves
a match with zero players, so P1 pressed it five times. P1's membership row has
since been swept for absence; only seat 1 remains. The room cannot be recovered.

Nothing errored because nothing failed. Every fallback did its job on input that
should never have reached it.

---

## 3. What changed

| Fault                                   | Fix                                                                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In-memory board adopts another map's id | `canResumeInMemoryMap` in `src/lib/Map/mapContent.ts`: resume only when the store's board is this route's map, or the route names no map                                                                |
| Reassigning `map` leaves a stale canvas | `{#key map}` around the editor's `MapRender`, so an identity change remounts the renderer. Paints bump `repaintSignal` and never reassign, so this cannot fire mid-edit                                 |
| A save can wipe a real board            | `wouldWipeBoard` guard in `/api/upload`: 409 when the incoming board has no units and no buildings but the stored one does. An undecodable blob answers "allow", so a parse failure never blocks a save |
| Rooms open on unplayable maps           | `/api/game` rejects with 400 when the map fields fewer than two sides, instead of falling back to a 2-seat room                                                                                         |
| `/play` proceeds with no teams          | Hard 500 with a clear message, plus an error-log line, instead of silently resolving every client to team 0                                                                                             |

Covered by `tests/Map/mapContent.unit.test.ts` (13 tests).

---

## 4. Recovering the original board

`map_data` is overwritten with no history, but the pre-overwrite board is
reconstructable from match telemetry. A `desync` log entry from session
`JN0mMFlXgW4ylny9` carries a full `boardSnapshot`, which records tile, type and
team for every unit and building. Rewinding the opening moves of
`W438EfsJImUHM5u0` (2026-08-25T02:34Z, the last match before the overwrite) gives
the starting positions. Both matches report digest `49c08eff` with 6 units and 12
buildings at event 0, so they were played on the same board.

Board: **10 x 10**, fog of war **on**. Tile index is `row * 10 + col`.

**Units** (all type 0, Strike Commando):

| Team | Tiles      | (col, row)        |
| ---- | ---------- | ----------------- |
| 0    | 20, 41, 60 | (0,2) (1,4) (0,6) |
| 1    | 29, 48, 69 | (9,2) (8,4) (9,6) |

**Buildings:**

| Type           | Team    | Tiles          | (col, row)              |
| -------------- | ------- | -------------- | ----------------------- |
| Warfactory     | 0       | 40             | (0,4)                   |
| Warfactory     | 1       | 49             | (9,4)                   |
| Ground Control | 0       | 50             | (0,5)                   |
| Ground Control | 1       | 59             | (9,5)                   |
| City           | neutral | 3, 5, 93, 95   | (3,0) (5,0) (3,9) (5,9) |
| Oil Refinery   | neutral | 21, 27, 71, 77 | (1,2) (7,2) (1,7) (7,7) |

The layout is mirror-symmetric left to right, which is a good sign the
reconstruction is faithful.

**Terrain is not recoverable.** The board digest deliberately excludes the ground
layer (it is not per-client state, so it was never worth hashing), and no other
record carries it. The ground layer has to be redrawn by hand.

One more place worth checking before it is lost: the browser that did the
overwrite may still hold a draft under `thunderlite:editor-drafts:v2`. The slot
keyed `0j981o7uXcUs` will hold the blank board, but the `new` slot, or another
browser profile, may still have the real one.
