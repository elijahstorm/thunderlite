import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { clearRelationship, setRelationship } from '$lib/Database/Relationships/relationships.js'

/** Block a player. Severs their side of the pair too (see setRelationship). */
export const POST = async ({ params, locals }) => {
	try {
		return json(
			await setRelationship({
				source: locals.user,
				target: params.userAuth,
				status: 'blocked',
			})
		)
	} catch (msg) {
		await logToErrorDb(msg)
		throw error(500, 'Could not access database')
	}
}

/**
 * Unblock. Scoped to `['blocked']` so this can only ever lift a block — it can
 * never clear a friendship or a pending request that happens to sit on the row.
 *
 * Lifting a block does NOT restore what the block severed: their friend claim
 * was set to `unknown` when you blocked them, and stays that way. Being friends
 * again takes a fresh request, which is the honest outcome.
 */
export const DELETE = async ({ params, locals }) => {
	const source = locals.user
	if (!source) return json({ status: 'unknown', cleared: false })
	try {
		const cleared = await clearRelationship(source, params.userAuth, ['blocked'])
		return json({ status: 'unknown', cleared })
	} catch (msg) {
		await logToErrorDb(msg)
		throw error(500, 'Could not access database')
	}
}
