import { writable } from 'svelte/store'

/**
 * The `matches` row id the match that just ended was recorded under, published
 * by `recordMatch` from the result endpoint's response. The results screen uses
 * it to link straight to the replay. Null until the write lands, and for
 * anything that has no replay to link to (hotseat and campaign matches never
 * touch the event log).
 */
export const recordedMatchId = writable<number | null>(null)

/** Drop the id from a previous match. Called as each new result is posted. */
export const clearRecordedMatch = (): void => recordedMatchId.set(null)
