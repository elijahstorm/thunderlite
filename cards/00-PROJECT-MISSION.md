# ThunderLite — Project Mission

ThunderLite is a browser-based recreation of the Kongregate Flash game **Battalion: Arena** (Urban Squall) — a turn-based tactics game in the Advance Wars family. The codebase is a SvelteKit app with a tile renderer, sprite pipeline, BFS pathfinder, animation system, and map editor already in place. The game logic on top of those bones is the gap.

## What "done" looks like (north star)

Two human players (hot-seat first, online second) load a map from the map editor and play a complete match of Battalion: Arena to a clean win/lose. Match flow:

1. Each player has a treasury, owns starting units and buildings, takes turns.
2. On your turn you can move every owned unit once; each unit can move, attack, capture, repair, mine, build, or wait.
3. Combat applies the Light/Medium/Heavy weapon-vs-armor matchup, terrain defense, HP-scaled damage, and counter-attacks within range. Stun and Slow/Fast attack modifiers apply where declared.
4. Buildings produce income each turn and unlock unit categories (Ground/Air/Sea Control). Warfactories build units for cash. Command Center capture is an instant loss. In Blitz mode the Warmachine builds adjacent units and mines Ore Deposits; lose your Warmachine, you lose.
5. The match ends when one side has no Command Center and no instant-lose units (or no units at all).

## What we are NOT building right now

- Pretty UI, animations, polish, theming. Functional UI only. Decouple UI from game logic so a designer can replace it later.
- New sound _assets_. Audio playback of the existing bank in `static/game/sounds/` is in scope (epic I); composing new audio is not.
- A from-scratch art pipeline. All sprite sheets, terrain art, building art, weather art, attack animations live in `static/game/play/` already.

## Recently expanded scope (epics I–K)

The original "two-player only, no single-player campaign" constraint has been **superseded**. CPU AI already exists under `src/lib/Engine/cpuAi/`, and the following are now in scope:

- **Audio (epic I)** — wire the existing `static/game/sounds/` bank to game events (mood-aware music, action SFX, weather loops).
- **Match-end hooks & stats (epic J)** — one `onMatchEnd` hook emitting a `MatchResult` that the end-game stats screen, result persistence, campaign unlocks, and future PvP elo all subscribe to independently.
- **Single-player campaign (epic K)** — a scripted-level DSL, a campaign runner, progression that unlocks the next level off the J1 hook, a Single Player entry on the title screen with continue/auto-advance, and 10 authored levels reusing the original Link / Torrial / Gannon story.

## Working norms

- **Modern, clean code**. No spaghetti. Files stay focused. New game-logic modules under `src/lib/Engine/` and `src/lib/GameData/`.
- **Decoupled**. The Svelte components in `src/lib/Engine/HUD/` (to be created) read from stores; the stores are owned by pure game-logic modules. The same game-logic modules must run headless in vitest.
- **Tests for new pure logic**. Damage formulas, capture progression, win checks, build-affordance — each gets unit tests.
- **Don't break the map editor or renderer.** They work today. The smoke test (`tests/smoke.e2e.test.ts`) and `tests/Map/MapRenderer.unit.test.ts` must keep passing.
- **One card = one commit (or a tight series).** Commit messages start with `[CARD-ID]` (e.g., `[A1] Add turn manager and player roster`).
- **Reuse existing assets.** Sprite sheets, attack animations, terrain tiles, building art, audio — all already in `static/game/play/`.
- **Weather is exploratory.** It wasn't in the original game; the existing sky layer was a side experiment. Don't spend much effort on it unless a card explicitly says to.

## How orchestration works

The work is broken into ~25 small cards under `cards/`. The orchestrator (`scripts/orchestrator.mjs`) runs them in order. Each card alternates between a coder cycle (implements + commits) and a QA cycle (reviews the commit, categorizes findings as CRITICAL / MAJOR / MINOR). The coder defends their work on the next pass — they fix valid criticisms and push back on false positives with code references.

## File map quick reference

- `src/lib/Engine/` — game logic and HUD components
- `src/lib/GameData/` — static data tables (units, terrain, buildings, modifiers)
- `src/lib/Map/` — map editor and renderer
- `src/lib/Sprites/` — sprite pipeline
- `static/game/play/` — all art assets
- `cards/` — work breakdown
- `scripts/orchestrator.mjs` — the orchestrator
