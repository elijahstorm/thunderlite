---
id: E2
epic: E - HUD & UX
title: Action menu after move (Attack / Capture / Repair / Mine / Build / Wait)
depends_on: [C2, C3, C4, E1, G4]
---

# E2 — Action menu after move

## Why this card exists

Today's interactor couples movement and attack — selecting a tile in the unit's reach either moves OR attacks based on whether that tile has an enemy. There's no way to move-then-capture, move-then-wait, or use a self-action like Mine or Repair.

## Scope

Restructure the interactor's `choice` step to:

1. Compute the move path (existing).
2. Animate the move (existing).
3. After the move completes, open an `ActionMenu` (new component) listing valid actions:
   - **Attack** — if any enemy is in range from the new tile
   - **Capture** — if standing on enemy/neutral building and unit has `Start_Turn.Capture`
   - **Mine** — if Warmachine on Ore Deposit
   - **Build** — if Warmachine
   - **Repair** — if unit has `Self_Action.Repairable` and HP < max (G4)
   - **Wait** — always
4. On the player's choice, dispatch the corresponding sub-action.

This card is the last in the HUD epic and depends on most game-logic cards being in place. If any of (C2, C3, C4, G4) didn't land, gate the corresponding menu item to "disabled" with a tooltip explaining why.

## Acceptance criteria

- [ ] Moving a Strike Commando onto an enemy City → menu shows Capture + Wait (+ Attack if an enemy is in range).
- [ ] Moving a Scorpion Tank within attack range of an enemy → menu shows Attack + Wait.
- [ ] Selecting Wait marks the unit as acted with no other side effect.
- [ ] Cancelling the menu (Escape) reverts the move and refunds the action (or, if the implementation is simpler: locks the move and only acts as Wait — choose one and document).
- [ ] Remove the C4 temporary coupling that hardwired Warmachine Build/Mine into the interactor.

## Files likely to change

- `src/lib/Engine/HUD/ActionMenu.svelte` (new)
- `src/lib/Engine/Interactor/interactor.ts`
- minor updates to existing modifier action wirings

## Out of scope

- Visual styling of the menu.
- Network sync (H2).

## Notes for the coder

- The "cancel reverts move" approach is harder; the "cancel = wait" approach is fine for the MVP. Document your choice in the commit message.
- The menu is the canonical entry point for self-actions. After E2, callers shouldn't open BuildMenu directly except through ActionMenu → Build.
