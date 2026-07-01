import { writable } from 'svelte/store'

// Dev-only board overlay toggle (the "Q" key on dev playgrounds). When on, the
// painter draws each tile's index + (x,y), and — if the board carries debug data
// (`map.debugHeat` / `map.debugFocus`) — tints tiles by an inspected heat value and
// rings the focus tile. Off in production; nothing reads it unless a dev page flips
// it. See paint.ts `devHud` and /dev/stealth-hunt.
export const devHudEnabled = writable<boolean>(false)

export const toggleDevHud = (): void => devHudEnabled.update((on) => !on)
