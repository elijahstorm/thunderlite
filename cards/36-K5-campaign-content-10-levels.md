---
id: K5
epic: K - Single-player campaign
title: Campaign content — 10 authored single-player levels
depends_on: [K2, K4]
---

# K5 — Campaign content: 10 authored levels

## Why this card exists

K1–K4 build the machinery; this card fills it with actual playable content: ~10 single-player levels, each a map plus a script (K1 DSL), wired into the K3 registry. Reuses the original game's cast — **Link** (player), **Torrial** (mentor/guide), **Gannon** (antagonist) — and the existing unit roster in [`unit.ts`](../src/lib/GameData/unit.ts). Goal is "technically works and is playable end-to-end"; the user will fine-tune balance and prose afterward.

## Scope

Author 10 levels under `src/lib/Campaign/levels/` — each a map (`.json` in the editor's map format, or an editor-built `mapSha`) plus a `.txt` script in the K1 DSL — and register them in order in `src/lib/Campaign/levels.ts`. Each level teaches/escalates one idea and carries the story. Suggested arc (transcribe into scripts, tune later):

| #   | Title           | Map theme        | Teaches                                 | Enemy roster                | Story beat                                  |
| --- | --------------- | ---------------- | --------------------------------------- | --------------------------- | ------------------------------------------- |
| 1   | First Contact   | small plains     | move, attack, attack/armor matchup      | Strike Commandos            | Torrial saves Link from Gannon's ambush     |
| 2   | Hold the Line   | river chokepoint | capture, capital = instant loss         | Commandos + 1 Scorpion Tank | capture Gannon's command center to survive  |
| 3   | Heavy Metal     | open field       | Heavy vs Light armor, counter-attacks   | Scorpion + Annihilator Tank | the Annihilator can't be beaten head-on     |
| 4   | Trench Warfare  | coast            | terrain defense, set-terrain (trenches) | mixed armor wave            | dig in along the coast, outlast the assault |
| 5   | Fog of War      | forest           | sight, cloak, Jammer Truck reveal       | Stealth Tanks               | Gannon fields hidden units                  |
| 6   | Supply Lines    | oil fields       | treasury, income buildings, build menu  | growing enemy economy       | seize oil + factories to fund troops        |
| 7   | Rolling Thunder | hills            | indirect fire (Mortar/Rocket), range    | entrenched defenders        | break a bottleneck with artillery           |
| 8   | Storm Front     | mountains        | weather effects (rain/storm)            | air + ground                | weather slows the advance; press anyway     |
| 9   | The Stronghold  | fortress         | combined arms, transports, air          | full roster, Warmachine     | assault Gannon's fortress                   |
| 10  | Final Standoff  | entrenched coast | everything + naval potshots             | full roster, naval          | the climactic battle vs Gannon              |

For each level write: a `<start>` block (camera tour + Torrial's setup dialogue + scripted enemy reveal), at least one `<turn N>` reinforcement/escalation beat, and `<win>` / `<lose>` dialogue. Pull tone and specific lines from the original scriptnotes where they fit (e.g. Torrial's armor-matchup explanation in level 1, the "rain slows troops" warning around level 8).

## Acceptance criteria

- [ ] 10 levels exist, registered in order in the K3 registry, each launchable from the campaign screen.
- [ ] Each level is winnable: a reasonable player can beat it, and a clean win triggers unlock + auto-advance (K3/K4).
- [ ] Each level has `<start>`, at least one `<turn N>`, and `<win>`/`<lose>` dialogue.
- [ ] Levels 1–3 introduce move/attack, capture, and armor matchups respectively (smoke-checkable).
- [ ] Playwright smoke: level 1 loads, plays its start dialogue, and is completable via the test win hook.

## Files likely to change

- `src/lib/Campaign/levels/01-first-contact.{json,txt}` … `10-final-standoff.{json,txt}` (new)
- `src/lib/Campaign/levels.ts` (register all 10 with titles + order)
- `tests/e2e/campaign-level-1.e2e.test.ts`

## Out of scope

- Voice acting, cutscene art, animated portraits.
- Perfect balance — "winnable and not obviously broken" is the bar; the user tunes after.

## Notes for the coder

- Build maps in the existing editor and export to the map format the runner consumes — do not invent a new map format.
- Every unit named in a script must exist in `unit.ts`. Keep enemy counts modest on levels 1–3 so the tutorial isn't punishing.
- Write real dialogue, not `TODO`/placeholder lines — the user asked for actual content. Keep it short and in-character; it doesn't have to be polished prose.
