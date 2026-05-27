// @vitest-environment node
import { describe, it, expect } from 'vitest'
import type { MatchResult, MatchOutcome } from '../../src/lib/Engine/matchEnd'
import {
	advanceProgress,
	campaignProgress,
	getUnlockedOrder,
	isUnlocked,
	hydrateProgress,
	type CampaignUser,
} from '../../src/lib/Campaign/progress'
import { campaignLevels, firstLevelOrder, lastLevelOrder } from '../../src/lib/Campaign/levels'

/** A minimal in-memory `localStorage` so the helpers run headless. */
const makeStorage = (init: Record<string, string> = {}) => {
	const store = new Map<string, string>(Object.entries(init))
	return {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => void store.set(key, value),
		store,
	}
}

/** Build a campaign `MatchResult` where the local player has `outcome`. */
const campaignResult = (
	levelId: string,
	outcome: MatchOutcome,
	userAuth?: string
): MatchResult => ({
	mode: 'campaign',
	campaignLevelId: levelId,
	winner: outcome === 'win' ? 0 : 1,
	turns: 5,
	endedAt: 0,
	players: [
		{ team: 0, outcome, isLocal: true, isCpu: false, userAuth },
		{ team: 1, outcome: outcome === 'win' ? 'loss' : 'win', isLocal: false, isCpu: true },
	],
})

const [level1, level2, level3] = campaignLevels

describe('advanceProgress', () => {
	it('unlocks the next order on a win', () => {
		expect(advanceProgress(1, 1, 4)).toBe(2)
		expect(advanceProgress(2, 2, 4)).toBe(3)
	})

	it('never regresses below the current order (replaying a beaten level)', () => {
		expect(advanceProgress(3, 1, 4)).toBe(3)
		expect(advanceProgress(2, 1, 4)).toBe(2)
	})

	it('caps at the last level (beating the final level adds nothing)', () => {
		expect(advanceProgress(4, 4, 4)).toBe(4)
		expect(advanceProgress(1, 9, 4)).toBe(4)
	})

	it('treats a non-finite current as a fresh start', () => {
		expect(advanceProgress(Number.NaN, 1, 4)).toBe(2)
	})

	it('defaults its cap to the registry last-level order', () => {
		expect(advanceProgress(1, lastLevelOrder)).toBe(lastLevelOrder)
		expect(advanceProgress(1, lastLevelOrder + 5)).toBe(lastLevelOrder)
	})
})

describe('getUnlockedOrder / isUnlocked', () => {
	it('a brand-new (signed-out) player has only the first level unlocked', () => {
		const storage = makeStorage()
		expect(getUnlockedOrder(null, storage)).toBe(firstLevelOrder)
		expect(isUnlocked(level1.id, null, storage)).toBe(true)
		expect(isUnlocked(level2.id, null, storage)).toBe(false)
	})

	it('a brand-new account starts with only the first level unlocked', () => {
		const storage = makeStorage()
		const user: CampaignUser = { auth: 'fresh-user' }
		expect(getUnlockedOrder(user, storage)).toBe(firstLevelOrder)
		expect(isUnlocked(level2.id, user, storage)).toBe(false)
	})

	it('returns false for an unknown level id', () => {
		expect(isUnlocked('no-such-level', null, makeStorage())).toBe(false)
	})
})

describe('campaignProgress (J1 subscriber)', () => {
	it('beating level 1 unlocks level 2 but leaves level 3+ locked', () => {
		const storage = makeStorage()
		campaignProgress(campaignResult(level1.id, 'win'), storage)

		expect(getUnlockedOrder(null, storage)).toBe(level2.order)
		expect(isUnlocked(level2.id, null, storage)).toBe(true)
		expect(isUnlocked(level3.id, null, storage)).toBe(false)
	})

	it('replaying an already-beaten level does not regress progress', () => {
		const storage = makeStorage()
		campaignProgress(campaignResult(level1.id, 'win'), storage)
		campaignProgress(campaignResult(level2.id, 'win'), storage) // now at order 3
		const before = getUnlockedOrder(null, storage)

		campaignProgress(campaignResult(level1.id, 'win'), storage) // replay level 1
		expect(getUnlockedOrder(null, storage)).toBe(before)
	})

	it('does nothing on a loss or a draw', () => {
		const storage = makeStorage()
		campaignProgress(campaignResult(level1.id, 'loss'), storage)
		campaignProgress(campaignResult(level1.id, 'draw'), storage)
		expect(getUnlockedOrder(null, storage)).toBe(firstLevelOrder)
	})

	it('ignores non-campaign results', () => {
		const storage = makeStorage()
		const result: MatchResult = {
			...campaignResult(level1.id, 'win'),
			mode: 'hotseat',
		}
		campaignProgress(result, storage)
		expect(getUnlockedOrder(null, storage)).toBe(firstLevelOrder)
	})

	it('keeps signed-in and signed-out progress in separate buckets', () => {
		const storage = makeStorage()
		// Guest beats level 1; a signed-in account on the same machine is unaffected.
		campaignProgress(campaignResult(level1.id, 'win'), storage)
		const signedIn: CampaignUser = { auth: 'player-a' }

		expect(getUnlockedOrder(null, storage)).toBe(level2.order)
		expect(getUnlockedOrder(signedIn, storage)).toBe(firstLevelOrder)
	})

	it('advances the signed-in account when that player wins', () => {
		const storage = makeStorage()
		campaignProgress(campaignResult(level1.id, 'win', 'player-a'), storage)
		expect(getUnlockedOrder({ auth: 'player-a' }, storage)).toBe(level2.order)
		expect(getUnlockedOrder(null, storage)).toBe(firstLevelOrder)
	})
})

describe('hydrateProgress', () => {
	it('seeds the local mirror from a server value without regressing local progress', () => {
		const storage = makeStorage()
		const user: CampaignUser = { auth: 'player-a' }

		hydrateProgress(user, 3, storage)
		expect(getUnlockedOrder(user, storage)).toBe(3)

		// A stale server read must not pull a further-ahead local value backwards.
		campaignProgress(campaignResult(level3.id, 'win', 'player-a'), storage) // unlocks level3.order + 1
		const ahead = Math.min(level3.order + 1, lastLevelOrder)
		hydrateProgress(user, 2, storage)
		expect(getUnlockedOrder(user, storage)).toBe(ahead)
	})
})
