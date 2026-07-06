// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Shared, hoisted mock state so the vi.mock factory (which is hoisted above the
// imports) can reference it. `calls` records every db round-trip so we can prove
// the batching / logged-out-skip behaviour, not just the shape of the output.
const h = vi.hoisted(() => {
	const calls: { table: string; options: unknown }[] = []
	const tableData: Record<string, Record<string, unknown>[]> = {}
	return { calls, tableData }
})

vi.mock('$lib/Security/serverLogs', () => ({ logToErrorDb: () => {} }))

vi.mock('$lib/dontcode/server', () => ({
	db: {
		find: async (table: string, options: unknown = {}) => {
			h.calls.push({ table, options })
			return h.tableData[table] ?? []
		},
		findOne: async (table: string, options: unknown = {}) => {
			h.calls.push({ table, options })
			return (h.tableData[table] ?? [])[0] ?? null
		},
		count: async (table: string, where: unknown) => {
			h.calls.push({ table, options: { where } })
			return (h.tableData[table] ?? []).length
		},
	},
}))

import { queryMaps } from '../../src/lib/Database/queryMaps'
import { queryUsersByAuth } from '../../src/lib/Database/getUserData'

const callsTo = (table: string) => h.calls.filter((c) => c.table === table)

function seedTwoOwnerFeed() {
	h.tableData.maps = [
		{
			id: 1,
			public_id: 'm1',
			owner_auth: 'ownerA',
			name: 'Alpha',
			description: 'first',
			thumbnail: '',
			status: 'public',
			plays: 0,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			map_type_id: 10,
		},
		{
			id: 2,
			public_id: 'm2',
			owner_auth: 'ownerB',
			name: 'Bravo',
			description: 'second',
			thumbnail: '',
			status: 'public',
			plays: 0,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			map_type_id: null,
		},
	]
	h.tableData.map_types = [{ id: 10, text: 'Skirmish' }]
	h.tableData.info_morph_map = [{ info_id: 100, entity_id: 1 }]
	h.tableData.info = [{ id: 100, info: 'Fire', color: '#f00' }]
	h.tableData.likes = [
		{ map_id: 1, user_auth: 'me-auth' },
		{ map_id: 1, user_auth: 'stranger' },
	]
	h.tableData.share_morph_map = [{ entity_id: 1 }]
	h.tableData.profiles = [
		{ id: 1, auth: 'ownerA', username: 'a', display_name: 'A', profile_image_url: '', bio: '' },
		{ id: 2, auth: 'ownerB', username: 'b', display_name: 'B', profile_image_url: '', bio: '' },
	]
	// Viewer 'me-auth' follows ownerA, is followed by ownerB, messaged ownerA twice.
	h.tableData.follows = [
		{ source: 'me-auth', target: 'ownerA' },
		{ source: 'ownerB', target: 'me-auth' },
	]
	h.tableData.messages = [
		{ source: 'me-auth', target: 'ownerA' },
		{ source: 'me-auth', target: 'ownerA' },
	]
	h.tableData.relationships = [{ source: 'me-auth', target: 'ownerA', status: 'friends' }]
}

beforeEach(() => {
	h.calls.length = 0
	for (const key of Object.keys(h.tableData)) delete h.tableData[key]
})

describe('queryMaps composition', () => {
	beforeEach(seedTwoOwnerFeed)

	it('joins type, info, likes and shares onto each map in JS', async () => {
		const { maps } = await queryMaps({}, '')

		expect(maps).toHaveLength(2)
		const alpha = maps.find((m) => m.public_id === 'm1')!
		expect(alpha.type).toBe('Skirmish')
		expect(alpha.likes).toBe(2)
		expect(alpha.shares).toBe(1)
		expect(alpha.info).toEqual([{ info: 'Fire', color: '#f00' }])

		const bravo = maps.find((m) => m.public_id === 'm2')!
		expect(bravo.type).toBeNull()
		expect(bravo.likes).toBe(0)
	})

	it('sets liked_by_me from the viewer, not a per-map query', async () => {
		const anon = await queryMaps({}, '')
		expect(anon.maps.find((m) => m.public_id === 'm1')!.liked_by_me).toBe(false)

		h.calls.length = 0
		const mine = await queryMaps({}, 'me-auth')
		expect(mine.maps.find((m) => m.public_id === 'm1')!.liked_by_me).toBe(true)
	})
})

describe('queryMaps owner batching (N+1 removal)', () => {
	beforeEach(seedTwoOwnerFeed)

	it('fetches all owner profiles in a single `in` query regardless of owner count', async () => {
		await queryMaps({}, '')

		const profileCalls = callsTo('profiles')
		expect(profileCalls).toHaveLength(1)
		expect(profileCalls[0].options).toMatchObject({
			where: { auth: { in: ['ownerA', 'ownerB'] } },
		})
	})

	it('skips ALL social lookups when logged out (me === "")', async () => {
		const { users } = await queryMaps({}, '')

		expect(callsTo('follows')).toHaveLength(0)
		expect(callsTo('messages')).toHaveLength(0)
		expect(callsTo('relationships')).toHaveLength(0)

		// Derived flags default to false/0/null with no viewer.
		const a = users.find((u) => u.auth === 'ownerA')!
		expect(a.following).toBe(false)
		expect(a.follower).toBe(false)
		expect(a.relationship).toBeNull()
	})

	it('batches social lookups (one call each) when logged in', async () => {
		const { users } = await queryMaps({}, 'me-auth')

		// One batched call per relation, not one-per-owner.
		expect(callsTo('follows')).toHaveLength(2) // following + follower directions
		expect(callsTo('messages')).toHaveLength(1)
		expect(callsTo('relationships')).toHaveLength(1)

		const a = users.find((u) => u.auth === 'ownerA')!
		expect(a.following).toBe(true) // me follows ownerA
		expect(a.relationship).toBe('friends')

		const b = users.find((u) => u.auth === 'ownerB')!
		expect(b.follower).toBe(true) // ownerB follows me
		expect(b.following).toBe(false)
	})
})

describe('queryUsersByAuth', () => {
	beforeEach(seedTwoOwnerFeed)

	it('dedupes auths and returns empty for no input without touching the db', async () => {
		expect(await queryUsersByAuth([], 'me-auth')).toEqual([])
		expect(h.calls).toHaveLength(0)

		await queryUsersByAuth(['ownerA', 'ownerA', 'ownerB'], '')
		expect(callsTo('profiles')[0].options).toMatchObject({
			where: { auth: { in: ['ownerA', 'ownerB'] } },
		})
	})

	it('counts messages per owner from a single batched fetch', async () => {
		const users = await queryUsersByAuth(['ownerA', 'ownerB'], 'me-auth')
		const a = users.find((u) => u.auth === 'ownerA') as unknown as { message_count: number }
		expect(a.message_count).toBe(2)
	})
})
