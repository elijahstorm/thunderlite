import { db } from '$lib/dontcode/server'

export const setRelationship: (
	params: {
		source?: string
		target: string
		status: RelationshipStatus
	},
	resolve: (response: { status: string }) => void
) => void = async (params, resolve) => {
	const { source, target, status } = params

	if (!source) return resolve({ status: 'not logged in' })
	if (source === target) return resolve({ status: 'same' })

	// The old single query pulled both directions with scalar subselects; the
	// platform API has no subqueries, so each direction is its own lookup.
	const [mineRow, theirsRow] = await Promise.all([
		db.findOne<{ status: RelationshipStatus }>('relationships', {
			where: { source, target },
			select: ['status'],
		}),
		db.findOne<{ status: RelationshipStatus }>('relationships', {
			where: { source: target, target: source },
			select: ['status'],
		}),
	])
	const relationship = { mine: mineRow?.status, theirs: theirsRow?.status }

	if (!mineRow) {
		await db.insert('relationships', { source, target, status })
	} else if (relationship.mine !== status) {
		if (status === 'friend-request' && relationship.mine === 'friends') {
			return resolve({ status: 'friends' })
		}
		if (status === 'friend-request' && relationship.theirs === 'friend-request') {
			await db.update('relationships', { source, target }, { status: 'friends' })
			await db.update('relationships', { source: target, target: source }, { status: 'friends' })
			return resolve({ status: 'friends' })
		}
		if (status === 'blocked') {
			await db.update('relationships', { source: target, target: source }, { status: 'unknown' })
		}
		await db.update('relationships', { source, target }, { status })
	}

	resolve({ status: 'ok' })
}
