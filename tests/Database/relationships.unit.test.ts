// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory `relationships` table. Only the operators this module actually
// uses are implemented: plain equality and `{ in: [...] }`.
const h = vi.hoisted(() => {
	const rows: Record<string, unknown>[] = []

	const matches = (row: Record<string, unknown>, where: Record<string, unknown> = {}) =>
		Object.entries(where).every(([column, condition]) => {
			if (condition && typeof condition === 'object' && 'in' in condition) {
				return (condition as { in: unknown[] }).in.includes(row[column])
			}
			return row[column] === condition
		})

	return { rows, matches }
})

vi.mock('$lib/dontcode/server', () => ({
	db: {
		find: async (_table: string, options: { where?: Record<string, unknown> } = {}) =>
			h.rows.filter((row) => h.matches(row, options.where)),
		findOne: async (_table: string, options: { where?: Record<string, unknown> } = {}) =>
			h.rows.find((row) => h.matches(row, options.where)) ?? null,
		insert: async (_table: string, data: Record<string, unknown>) => {
			h.rows.push({ ...data })
			return { id: h.rows.length }
		},
		update: async (
			_table: string,
			where: Record<string, unknown>,
			data: Record<string, unknown>
		) => {
			const hits = h.rows.filter((row) => h.matches(row, where))
			hits.forEach((row) => Object.assign(row, data))
			return { count: hits.length }
		},
	},
}))

import {
	clearRelationship,
	listFriendRequests,
	setRelationship,
} from '../../src/lib/Database/Relationships/relationships'

const seed = (source: string, target: string, status: string) =>
	h.rows.push({ source, target, status })
const row = (source: string, target: string) =>
	h.rows.find((entry) => entry.source === source && entry.target === target)

beforeEach(() => {
	h.rows.length = 0
})

describe('setRelationship', () => {
	it('answers with the resulting status, not an opaque ok', async () => {
		// The profile page paints its button straight from `status`; when this
		// returned 'ok' the button sat on "Add friend" until a reload.
		const result = await setRelationship({ source: 'me', target: 'you', status: 'friend-request' })

		expect(result).toEqual({ status: 'friend-request', outcome: 'created' })
		expect(row('me', 'you')).toMatchObject({ status: 'friend-request' })
	})

	it('accepts a pending request even when the accepter has no row yet', async () => {
		seed('you', 'me', 'friend-request')

		const result = await setRelationship({ source: 'me', target: 'you', status: 'friend-request' })

		expect(result).toEqual({ status: 'friends', outcome: 'auto-accepted' })
		expect(row('me', 'you')).toMatchObject({ status: 'friends' })
		expect(row('you', 'me')).toMatchObject({ status: 'friends' })
	})

	it('accepts a pending request when the accepter already has a neutral row', async () => {
		seed('you', 'me', 'friend-request')
		seed('me', 'you', 'unknown')

		const result = await setRelationship({ source: 'me', target: 'you', status: 'friend-request' })

		expect(result.outcome).toBe('auto-accepted')
		expect(row('me', 'you')).toMatchObject({ status: 'friends' })
		expect(row('you', 'me')).toMatchObject({ status: 'friends' })
	})

	it('never downgrades an existing friendship to a request', async () => {
		seed('me', 'you', 'friends')
		seed('you', 'me', 'friends')

		const result = await setRelationship({ source: 'me', target: 'you', status: 'friend-request' })

		expect(result).toEqual({ status: 'friends', outcome: 'unchanged' })
		expect(row('me', 'you')).toMatchObject({ status: 'friends' })
	})

	it('reports a repeat request as unchanged so it does not re-notify', async () => {
		seed('me', 'you', 'friend-request')

		const result = await setRelationship({ source: 'me', target: 'you', status: 'friend-request' })

		expect(result).toEqual({ status: 'friend-request', outcome: 'unchanged' })
	})

	it('refuses to record a request aimed at someone who blocked you', async () => {
		seed('you', 'me', 'blocked')

		const result = await setRelationship({ source: 'me', target: 'you', status: 'friend-request' })

		expect(result.outcome).toBe('blocked-by-target')
		expect(row('me', 'you')).toBeUndefined()
	})

	it('severs the other side when blocking', async () => {
		seed('me', 'you', 'friends')
		seed('you', 'me', 'friends')

		const result = await setRelationship({ source: 'me', target: 'you', status: 'blocked' })

		expect(result).toEqual({ status: 'blocked', outcome: 'updated' })
		expect(row('me', 'you')).toMatchObject({ status: 'blocked' })
		expect(row('you', 'me')).toMatchObject({ status: 'unknown' })
	})

	it('refuses anonymous and self-directed writes', async () => {
		expect(await setRelationship({ target: 'you', status: 'friend-request' })).toMatchObject({
			outcome: 'not-logged-in',
		})
		expect(
			await setRelationship({ source: 'me', target: 'me', status: 'friend-request' })
		).toMatchObject({ outcome: 'self' })
		expect(h.rows).toHaveLength(0)
	})
})

describe('clearRelationship', () => {
	it('clears a pending request in the direction asked for', async () => {
		seed('you', 'me', 'friend-request')

		expect(await clearRelationship('you', 'me', ['friend-request'])).toBe(true)
		expect(row('you', 'me')).toMatchObject({ status: 'unknown' })
	})

	it('leaves a block alone when only requests may be cleared', async () => {
		seed('you', 'me', 'blocked')

		expect(await clearRelationship('you', 'me', ['friend-request'])).toBe(false)
		expect(row('you', 'me')).toMatchObject({ status: 'blocked' })
	})
})

describe('listFriendRequests', () => {
	it('splits pending requests by direction', async () => {
		seed('alice', 'me', 'friend-request')
		seed('me', 'bob', 'friend-request')
		seed('me', 'carol', 'friends')
		seed('dave', 'me', 'blocked')

		expect(await listFriendRequests('me')).toEqual({ incoming: ['alice'], outgoing: ['bob'] })
	})

	it('reports a pair pending in both directions as incoming, so it can be resolved', async () => {
		seed('alice', 'me', 'friend-request')
		seed('me', 'alice', 'friend-request')

		expect(await listFriendRequests('me')).toEqual({ incoming: ['alice'], outgoing: [] })
	})

	it('has nothing to list for a signed-out viewer', async () => {
		seed('alice', 'me', 'friend-request')

		expect(await listFriendRequests('')).toEqual({ incoming: [], outgoing: [] })
	})
})
