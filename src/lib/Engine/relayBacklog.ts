/**
 * relayBacklog — how many of this client's own actions the room has not
 * accepted yet.
 *
 * `GameSocket` has always tracked this internally (it is the `owed` half of the
 * lag gauge), but nothing outside the socket could see it, and one thing outside
 * the socket badly needs to: the End Turn button, which in an async match turns
 * into a "Next game" jump the moment the LOCAL board says the turn is over.
 *
 * Local is not the same as recorded. A turn ends on this board as soon as the
 * player clicks; the moves behind it are still going out one relay at a time.
 * Offering a way off the board in that window invites the player to leave while
 * their turn is half-relayed — and a jump taken then reads as "nothing
 * happened", because the handover the destination is chosen from has not landed
 * either.
 *
 * So the count is published. Zero means the room holds everything this client
 * has done, which is the only point at which leaving is free.
 */

import { writable } from 'svelte/store'

/** Actions applied locally that the room has not accepted yet. */
export const relayBacklog = writable(0)

export const setRelayBacklog = (owed: number): void => relayBacklog.set(owed)

/** Fresh match (or a board with no online layer): nothing is owed. */
export const resetRelayBacklog = (): void => relayBacklog.set(0)
