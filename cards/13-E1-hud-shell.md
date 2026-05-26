---
id: E1
epic: E - HUD & UX
title: In-game HUD shell — replace debug overlay
depends_on: [A2, C1]
---

# E1 — In-game HUD shell — replace debug overlay

## Why this card exists

[`GameStateManager.svelte`](../src/lib/Engine/GameStateManager.svelte) currently renders only a debug "state | active" text overlay. Players need a real HUD: whose turn, money, end-turn button, and a selected-tile info panel.

## Scope

- Create `src/lib/Engine/HUD/HUDRoot.svelte` that composes:
  - `TurnPill` (already from A2) — current player and turn number
  - `Treasury` (from C1) — current player money
  - `EndTurnButton` (already from A2)
  - `TileInfoPanel` (new) — when a tile is selected or hovered, show: terrain name + protection bonus, building (if any) + owner + stature, unit (if any) + team + HP + power + range + modifier badges.
- Replace the debug overlay in `GameStateManager.svelte` with `<HUDRoot />`.
- Keep the HUD a single column on the right side of the screen. Functional. No tooltips. No animations.

## Acceptance criteria

- [ ] No debug overlay; instead the HUD shows turn, money, end-turn button, and tile info.
- [ ] Hovering a tile updates the info panel (use the existing hover store / interfacer).
- [ ] Selecting a tile pins it in the info panel until the selection clears.
- [ ] HUD reads only from stores. No game logic in components.
- [ ] Smoke test passes.

## Files likely to change

- `src/lib/Engine/HUD/HUDRoot.svelte` (new)
- `src/lib/Engine/HUD/TileInfoPanel.svelte` (new)
- `src/lib/Engine/HUD/EndTurnButton.svelte` (extract from A2 if not already a separate file)
- `src/lib/Engine/GameStateManager.svelte`

## Out of scope

- Action menu after move (E2).
- Editor "play" button (E3).
- Modifier descriptions / tooltips. List modifiers by raw key for now — readable enough.

## Notes for the coder

- The hover store is currently per-component. If you need a shared hover position, add a tiny store under `src/lib/Engine/uiState.ts`.
- Use Tailwind utility classes (already in the project). Don't introduce a UI kit.
