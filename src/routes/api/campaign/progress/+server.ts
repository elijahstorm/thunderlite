import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { db } from '$lib/dontcode/server'
import { firstLevelOrder, lastLevelOrder } from '$lib/Campaign/levels'

/**
 * POST /api/campaign/progress — the write-through target of the K3 campaign
 * progress subscriber (`$lib/Campaign/progress.ts`). Persists the signed-in
 * player's `highest_unlocked_order`, clamped to the real level range and
 * never regressing (mirrors `hydrateProgress`'s non-regression rule), keyed
 * by `user_auth` via upsert.
 */
export const POST = async ({ request, locals }) => {
	const userAuth = locals.user
	if (!userAuth) throw error(401, 'User not logged in')

	let parsed: unknown
	try {
		parsed = await request.json()
	} catch {
		throw error(400, 'Invalid JSON body')
	}
	const raw = (parsed as { highestUnlockedOrder?: unknown })?.highestUnlockedOrder
	if (typeof raw !== 'number' || !Number.isFinite(raw)) {
		throw error(400, 'Invalid highestUnlockedOrder')
	}
	const order = Math.min(Math.max(Math.trunc(raw), firstLevelOrder), lastLevelOrder)

	try {
		const existing = await db.findOne<{ highest_unlocked_order: number }>('campaign_progress', {
			where: { user_auth: userAuth },
			select: ['highest_unlocked_order'],
		})
		const next = Math.max(existing?.highest_unlocked_order ?? firstLevelOrder, order)

		await db.upsert(
			'campaign_progress',
			{ user_auth: userAuth },
			{ highest_unlocked_order: next, updated_at: new Date().toISOString() }
		)

		return json({ status: 'ok', highestUnlockedOrder: next })
	} catch (msg) {
		logToErrorDb(msg)
		throw error(500, 'Could not persist campaign progress')
	}
}
