// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory `relationships` table, same idiom as relationships.unit.test.ts.
// Only the operators these helpers use are implemented: equality and `in`.
const h = vi.hoisted(() => {
	const rows: Record<string, unknown>[] = []
	const calls: { where: Record<string, unknown> | undefined }[] = []

	const matches = (row: Record<string, unknown>, where: Record<string, unknown> = {}) =>
		Object.entries(where).every(([column, condition]) => {
			if (condition && typeof condition === 'object' && 'in' in condition) {
				return (condition as { in: unknown[] }).in.includes(row[column])
			}
			return row[column] === condition
		})

	return { rows, calls, matches }
})

vi.mock('$lib/dontcode/server', () => ({
	db: {
		find: async (_table: string, options: { where?: Record<string, unknown> } = {}) => {
			h.calls.push({ where: options.where })
			return h.rows.filter((row) => h.matches(row, options.where))
		},
		findOne: async (_table: string, options: { where?: Record<string, unknown> } = {}) => {
			h.calls.push({ where: options.where })
			return h.rows.find((row) => h.matches(row, options.where)) ?? null
		},
	},
}))

import { blockedAuths, getBlockState } from '../../src/lib/Database/Relationships/blocking'

const seed = (source: string, target: string, status: string) =>
	h.rows.push({ source, target, status })

beforeEach(() => {
	h.rows.length = 0
	h.calls.length = 0
})

describe('getBlockState', () => {
	it('reads both directions, because a block only exists on the blocker row', async () => {
		seed('you', 'me', 'blocked')

		// Nothing on the viewer's own row mentions a block, so a single-direction
		// read would call this pair open and let the DM straight through.
		expect(await getBlockState('me', 'you')).toEqual({
			blockedByMe: false,
			blockedMe: true,
			blocked: true,
		})
	})

	it('reports the viewer own block as theirs to lift', async () => {
		seed('me', 'you', 'blocked')

		expect(await getBlockState('me', 'you')).toEqual({
			blockedByMe: true,
			blockedMe: false,
			blocked: true,
		})
	})

	it('does not read a friendship or a pending request as a block', async () => {
		seed('me', 'you', 'friends')
		seed('you', 'me', 'friend-request')

		expect(await getBlockState('me', 'you')).toMatchObject({ blocked: false })
	})

	it('short-circuits self and signed-out pairs without a query', async () => {
		expect(await getBlockState('me', 'me')).toMatchObject({ blocked: false })
		expect(await getBlockState('', 'you')).toMatchObject({ blocked: false })
		expect(h.calls).toHaveLength(0)
	})
})

describe('blockedAuths', () => {
	it('collects both directions into one set', async () => {
		seed('me', 'a', 'blocked')
		seed('b', 'me', 'blocked')
		seed('me', 'c', 'friends')

		expect(await blockedAuths('me')).toEqual(new Set(['a', 'b']))
	})

	it('scopes both reads to the candidates it was given', async () => {
		seed('me', 'a', 'blocked')
		seed('b', 'me', 'blocked')

		// The page already knows which profiles it is about to render; scoping keeps
		// the reads indexed instead of pulling the viewer whole block list back.
		expect(await blockedAuths('me', ['a'])).toEqual(new Set(['a']))
		expect(h.calls.map((call) => call.where)).toEqual([
			{ source: 'me', status: 'blocked', target: { in: ['a'] } },
			{ target: 'me', status: 'blocked', source: { in: ['a'] } },
		])
	})

	it('answers empty for a signed-out viewer or an empty candidate list', async () => {
		seed('me', 'a', 'blocked')

		expect(await blockedAuths('')).toEqual(new Set())
		expect(await blockedAuths('me', [])).toEqual(new Set())
		expect(h.calls).toHaveLength(0)
	})
})
