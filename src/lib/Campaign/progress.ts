/**
 * progress — campaign progression as a J1 `onMatchEnd` subscriber (K3).
 *
 * This is a peer of `recordMatch` (J3): it hangs off the single match-end event
 * and knows nothing about the stats screen or any UI. On a campaign *win* it
 * raises the player's `highest_unlocked_order` so the next level becomes
 * playable. The unlock rule is the pure `advanceProgress` so the signed-in (DB)
 * and signed-out (localStorage) paths share one tested function.
 *
 * Persistence on the client is a per-account `localStorage` mirror; when the
 * player is signed in we additionally write the new value through to the
 * `campaign_progress` table via a best-effort POST (same fire-and-forget shape
 * as `recordMatch`). The server value is seeded back into the mirror by the K4
 * loader through `hydrateProgress`, so reads stay synchronous for the UI.
 */

import { onMatchEnd, type MatchResult } from '$lib/Engine/matchEnd'
import { firstLevelOrder, getLevelById, lastLevelOrder } from './levels'

/** The minimal identity slice the progress helpers need. */
export type CampaignUser = { auth?: string | null } | null | undefined

const STORAGE_PREFIX = 'thunderlite.campaign.progress.v1'

/**
 * The unlock rule, pure and total. Beating `beatenOrder` unlocks `beatenOrder +
 * 1`, never exceeding `cap` (the last level) and never regressing below
 * `current` — so replaying an already-beaten level is a no-op. A non-finite
 * `current` is treated as "fresh" (`firstLevelOrder`).
 */
export const advanceProgress = (
	current: number,
	beatenOrder: number,
	cap: number = lastLevelOrder
): number => {
	const safeCurrent = Number.isFinite(current) ? current : firstLevelOrder
	const unlocked = Math.min(beatenOrder + 1, cap)
	return Math.max(safeCurrent, unlocked)
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

/** The browser's `localStorage`, or `null` under SSR / when it is unavailable. */
const defaultStorage = (): StorageLike | null => {
	try {
		if (typeof window === 'undefined') return null
		return window.localStorage
	} catch {
		return null
	}
}

const authOf = (user: CampaignUser): string | null => (user && user.auth ? user.auth : null)

/**
 * Per-account storage key. Signed-in accounts get their own bucket so two
 * players on one machine never clobber each other's mirror; signed-out play
 * shares a `guest` bucket.
 */
const storageKey = (user: CampaignUser): string => `${STORAGE_PREFIX}:${authOf(user) ?? 'guest'}`

const readOrder = (user: CampaignUser, storage: StorageLike | null): number => {
	if (!storage) return firstLevelOrder
	try {
		const raw = storage.getItem(storageKey(user))
		if (!raw) return firstLevelOrder
		const n = Number.parseInt(raw, 10)
		if (!Number.isFinite(n) || n < firstLevelOrder) return firstLevelOrder
		return Math.min(n, lastLevelOrder)
	} catch {
		return firstLevelOrder
	}
}

const writeOrder = (user: CampaignUser, order: number, storage: StorageLike | null): void => {
	if (!storage) return
	try {
		storage.setItem(storageKey(user), String(order))
	} catch {
		/* quota / privacy mode — non-fatal */
	}
}

/**
 * The highest campaign order the player has unlocked. A fresh account or
 * signed-out player has only the first level unlocked.
 */
export const getUnlockedOrder = (
	user: CampaignUser,
	storage: StorageLike | null = defaultStorage()
): number => readOrder(user, storage)

/** Whether a specific level is unlocked for the player. */
export const isUnlocked = (
	levelId: string,
	user: CampaignUser,
	storage: StorageLike | null = defaultStorage()
): boolean => {
	const level = getLevelById(levelId)
	if (!level) return false
	return level.order <= getUnlockedOrder(user, storage)
}

/**
 * Seed the local mirror from a server-loaded value (K4 loader). Uses the same
 * non-regressing rule so a value the player already advanced past locally is
 * never pulled backwards by a stale server read.
 */
export const hydrateProgress = (
	user: CampaignUser,
	serverOrder: number,
	storage: StorageLike | null = defaultStorage()
): void => {
	const current = readOrder(user, storage)
	const next = Math.max(current, Math.min(Math.max(serverOrder, firstLevelOrder), lastLevelOrder))
	if (next !== current) writeOrder(user, next, storage)
}

/** Best-effort write-through to the `campaign_progress` table; never blocks. */
const postProgress = (highestUnlockedOrder: number): void => {
	if (typeof fetch !== 'function') return
	try {
		void fetch('/api/campaign/progress', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ highestUnlockedOrder }),
		}).catch(() => {
			// Persistence is best-effort; swallow network/server errors.
		})
	} catch {
		// Relative URL outside a browser, etc. — non-fatal.
	}
}

/**
 * The J1 subscriber. On a campaign win for the local player, advance the
 * unlocked order (capped, non-regressing) and persist it: always to the local
 * mirror, and through to the DB when the local player is signed in.
 */
export const campaignProgress = (
	result: MatchResult,
	storage: StorageLike | null = defaultStorage()
): void => {
	if (result.mode !== 'campaign' || !result.campaignLevelId) return

	const level = getLevelById(result.campaignLevelId)
	if (!level) return

	const local = result.players.find((p) => p.isLocal)
	if (!local || local.outcome !== 'win') return

	const user: CampaignUser = local.userAuth ? { auth: local.userAuth } : null
	const current = readOrder(user, storage)
	const next = advanceProgress(current, level.order)
	if (next === current) return

	writeOrder(user, next, storage)
	if (local.userAuth) postProgress(next)
}

/** Register `campaignProgress` as a match-end subscriber. Returns an unsubscribe. */
export const registerCampaignProgress = (): (() => void) => onMatchEnd(campaignProgress)
