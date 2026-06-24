// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	resolveCachedUser,
	invalidateCachedUser,
	_clearSessionCache,
	type CachedUser,
} from '../../src/lib/dontcode/sessionCache'

const USER: CachedUser = { id: 'u1', email: 'a@b.co' }

beforeEach(() => {
	_clearSessionCache()
	vi.spyOn(Date, 'now').mockReturnValue(0)
})

afterEach(() => {
	vi.restoreAllMocks()
})

describe('resolveCachedUser', () => {
	it('caches a resolved user so repeat calls skip the fetcher', async () => {
		const fetcher = vi.fn().mockResolvedValue(USER)

		expect(await resolveCachedUser('tok', fetcher)).toEqual(USER)
		expect(await resolveCachedUser('tok', fetcher)).toEqual(USER)
		expect(fetcher).toHaveBeenCalledTimes(1)
	})

	it('caches a definitive signed-out (null) result', async () => {
		const fetcher = vi.fn().mockResolvedValue(null)

		expect(await resolveCachedUser('tok', fetcher)).toBeNull()
		expect(await resolveCachedUser('tok', fetcher)).toBeNull()
		expect(fetcher).toHaveBeenCalledTimes(1)
	})

	it('re-validates once the TTL has elapsed', async () => {
		const fetcher = vi.fn().mockResolvedValue(USER)

		await resolveCachedUser('tok', fetcher)
		vi.spyOn(Date, 'now').mockReturnValue(61_000)
		await resolveCachedUser('tok', fetcher)

		expect(fetcher).toHaveBeenCalledTimes(2)
	})

	it('serves the last-known user on a transient fetch failure', async () => {
		const fetcher = vi.fn().mockResolvedValueOnce(USER).mockRejectedValueOnce(new Error('502'))

		await resolveCachedUser('tok', fetcher)
		vi.spyOn(Date, 'now').mockReturnValue(61_000) // force a re-validate that fails

		expect(await resolveCachedUser('tok', fetcher)).toEqual(USER)
	})

	it('returns null on a transient failure with no prior state', async () => {
		const fetcher = vi.fn().mockRejectedValue(new Error('502'))

		expect(await resolveCachedUser('tok', fetcher)).toBeNull()
	})

	it('forgets a token after invalidation', async () => {
		const fetcher = vi.fn().mockResolvedValue(USER)

		await resolveCachedUser('tok', fetcher)
		invalidateCachedUser('tok')
		await resolveCachedUser('tok', fetcher)

		expect(fetcher).toHaveBeenCalledTimes(2)
	})
})
