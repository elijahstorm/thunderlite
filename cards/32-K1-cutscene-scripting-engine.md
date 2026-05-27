---
id: K1
epic: K - Single-player campaign
title: Cutscene / level scripting engine (DSL parser)
depends_on: [A1]
---

# K1 — Cutscene / level scripting engine

## Why this card exists

The original game shipped a scripted-level DSL (`Script_Reader` in the old `levels.js`) that drove its tutorial campaign. Levels were authored as plain text with commands and `<start>` / `<win>` / `<lose>` / `<turn N>` blocks. The new repo has no scripting layer. This card ports the DSL as a pure, typed parser — the foundation for the campaign (K2–K5).

## Scope

- `src/lib/Campaign/cutsceneScript.ts`: parse a script string into an ordered, typed `CutsceneEvent[]` discriminated union, mirroring the style of [`serializedAction.ts`](../src/lib/Engine/Interactor/serializedAction.ts).
- Commands to support (from the original DSL):
  - `talk <speaker>: "line", "line2"` → `{ kind: 'talk'; speaker; lines: string[] }`
  - `move: x,y` (camera) → `{ kind: 'camera'; x; y }`
  - `hl: x,y` / `unhl: x,y` → `{ kind: 'highlight' | 'unhighlight'; x; y }`
  - `wait: n` → `{ kind: 'wait'; seconds }`
  - `add unit: team,"Name",x,y` → `{ kind: 'spawn'; team; unit; x; y }`
  - `kill unit: x,y` → `{ kind: 'kill'; x; y }`
  - `terrain: "Type",x,y` → `{ kind: 'setTerrain'; terrain; x; y }`
- Block markers group events: `<start>…</start>`, `<win>…</win>`, `<lose>…</lose>`, `<turn N>…</turn>` → a keyed structure `{ start: [...], win: [...], lose: [...], turns: { [n]: [...] } }`.
- Multi-line `talk` (comma-separated quoted strings, possibly spanning lines) preserved intact.

## Acceptance criteria

- [ ] A sample script parses into the correct ordered events with multi-line `talk` preserved.
- [ ] Block markers route events into `start` / `win` / `lose` / `turns[n]`.
- [ ] Malformed lines raise a parse error with the line number (not silently dropped).
- [ ] Vitest covers every command plus all four block types plus a multi-line `talk`.

## Files likely to change

- `src/lib/Campaign/cutsceneScript.ts` (new)
- `src/lib/Campaign/cutsceneTypes.ts` (new)
- `tests/Campaign/cutsceneScript.unit.test.ts`

## Out of scope

- Executing events against a live game (K2).
- A visual script authoring tool.

## Notes for the coder

- Pure parser, zero engine imports. It takes a string and returns data.
- Unit names in `spawn` must match `unitData` names in [`unit.ts`](../src/lib/GameData/unit.ts) (Strike Commando, Scorpion Tank, Annihilator Tank, etc.); validate and error on unknown names so authoring mistakes surface early.
