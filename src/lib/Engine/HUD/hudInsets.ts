import { writable } from 'svelte/store'

/**
 * Width in CSS px that the runtime HUD occupies along the right edge of the
 * viewport, published by `HUDRoot` as its rail is measured / collapsed.
 *
 * The gameplay board reads this and reserves exactly that much room on its own
 * right edge (see `MapRender`), so the rail sits in a gutter beside the map
 * instead of floating on top of it. Before this existed the HUD was a fixed
 * top-right stack: every tile underneath it was unclickable, because the panels
 * — not the board — received the pointer events. Reserving the space is the only
 * fix that holds regardless of how tall or wide the HUD grows.
 *
 * Screen-space overlays that anchor themselves to a tile (the post-move
 * ActionMenu) also subtract this when clamping, so they never slide under the
 * rail.
 *
 * `0` whenever no HUD is mounted (editor, minimap-only, menus).
 */
export const hudGutter = writable(0)

export const setHudGutter = (px: number): void => {
	hudGutter.set(Math.max(0, Math.round(px)))
}

/**
 * Visual width of the HUD rail, which is NOT always the same as `hudGutter`.
 * On narrow viewports an expanded rail floats over the board and only reserves
 * the collapsed width as gutter (the board would be unplayably small otherwise),
 * so the gutter under-reports how much of the right edge is actually painted.
 *
 * Anything that must stay *visually* clear of the rail — the chat docks, which
 * would otherwise end up underneath a floating rail — reads this instead.
 */
export const hudRailWidth = writable(0)

export const setHudRailWidth = (px: number): void => {
	hudRailWidth.set(Math.max(0, Math.round(px)))
}

export const clearHudGutter = (): void => {
	hudGutter.set(0)
	hudRailWidth.set(0)
}

/**
 * Stacking order for everything `position: fixed` inside a match, lowest first.
 *
 * Match overlays are confined to the BOARD REGION — `left-0` with
 * `right: hudGutter` — and sit UNDER the chrome, so the rail and the chat docks
 * stay usable while a results panel, a dialogue line or a turn card is up.
 * They still swallow board input, which is the point of them; they must never
 * swallow the rail or a chat. That is what `fixed inset-0` overlays here used
 * to do: a "Your Turn" card blurred the whole window for a second and the
 * results screen sat on top of everything until you left the match.
 *
 *   z-30   StatsScreen       results panel (dismissable, see resultsPanelStore)
 *   z-32   Dialogue          campaign lines
 *   z-34   TurnTransition    "Your Turn" card
 *   z-40   GameChat dock, top-centre clocks, pointer-events-none banners
 *   z-49   HUD click-away veil (narrow viewports)
 *   z-50   HUDRoot rail, DM docks, toasts
 *   z-54…56  ActionMenu      interactor: veil, focus ring, panel
 *   z-60   BuildMenu         interactor modal
 *   z-80   ResumePrompt      a decision before the level starts; nothing behind it yet
 */
