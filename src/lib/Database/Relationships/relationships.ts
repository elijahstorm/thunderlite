import { db, type Where } from '$lib/dontcode/server'

/**
 * Directed relationships (`relationships.source -> target`). Each side owns its
 * own row, so "friends" is two rows and a pending request is one.
 */

/** What a write actually did, so callers can gate side effects on it. */
export type RelationshipOutcome =
	/** No row existed; the request / block is brand new. */
	| 'created'
	/** An existing row moved to a different status. */
	| 'updated'
	/** Already in that state; nothing was written. */
	| 'unchanged'
	/** Mutual friend requests met: both sides are now friends. */
	| 'auto-accepted'
	/** The target has blocked the source; the write was refused. */
	| 'blocked-by-target'
	/** The source has blocked the target; the write was refused. */
	| 'blocked-target'
	| 'not-logged-in'
	| 'self'

export interface RelationshipResult {
	/**
	 * Where the pair stands after the write, from the source's side. This is a
	 * real `RelationshipStatus` (never an opaque 'ok'), so a client can render
	 * the new button state straight from the response.
	 */
	status: RelationshipStatus
	outcome: RelationshipOutcome
}

export const setRelationship = async (params: {
	source?: string
	target: string
	status: RelationshipStatus
}): Promise<RelationshipResult> => {
	const { source, target, status } = params

	if (!source) return { status: 'unknown', outcome: 'not-logged-in' }
	if (source === target) return { status: 'unknown', outcome: 'self' }

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
	const mine = mineRow?.status
	const theirs = theirsRow?.status

	if (status === 'friend-request') {
		// Someone who blocked you never hears about a request, so don't record
		// one either (it would leave a permanently pending row and email them).
		if (theirs === 'blocked') {
			return { status: mine ?? 'unknown', outcome: 'blocked-by-target' }
		}

		// You blocked them. Befriending would silently lift the block, so make it
		// an explicit two-step: unblock first, then ask.
		if (mine === 'blocked') {
			return { status: 'blocked', outcome: 'blocked-target' }
		}

		// Asking to be friends with someone who already asked you IS the accept:
		// both directions flip in one step. Checked before the insert path below,
		// because accepting a request from someone you have no row for must still
		// become `friends` rather than leaving two pending requests facing off.
		if (theirs === 'friend-request' && mine !== 'friends') {
			await Promise.all([
				mineRow
					? db.update('relationships', { source, target }, { status: 'friends' })
					: db.insert('relationships', { source, target, status: 'friends' }),
				db.update('relationships', { source: target, target: source }, { status: 'friends' }),
			])
			return { status: 'friends', outcome: 'auto-accepted' }
		}

		// Re-asking someone you're already friends with is a no-op, not a downgrade.
		if (mine === 'friends') return { status: 'friends', outcome: 'unchanged' }
	}

	if (!mineRow) {
		await db.insert('relationships', { source, target, status })
		return { status, outcome: 'created' }
	}

	if (mine === status) return { status, outcome: 'unchanged' }

	// Blocking severs their side too, so they can't keep a stale friends /
	// friend-request claim on someone who blocked them.
	if (status === 'blocked' && theirsRow) {
		await db.update('relationships', { source: target, target: source }, { status: 'unknown' })
	}

	await db.update('relationships', { source, target }, { status })
	return { status, outcome: 'updated' }
}

/**
 * Take one direction back to neutral: declining a request you received,
 * cancelling one you sent, or unfriending. `only` guards which statuses may be
 * cleared, so a decline can never quietly undo a block.
 */
export const clearRelationship = async (
	source: string,
	target: string,
	only?: RelationshipStatus[]
): Promise<boolean> => {
	if (!source || !target || source === target) return false
	const where: Where = { source, target }
	if (only?.length) where.status = { in: only }
	const { count } = await db.update('relationships', where, { status: 'unknown' })
	return count > 0
}

/**
 * The pending friend requests around one user, as auth ids.
 *
 * A pair that is pending in BOTH directions should have auto-accepted; rows
 * written before that was handled on the insert path can still be stuck that
 * way, so they're reported as incoming only. Accepting resolves them.
 */
export const listFriendRequests = async (
	me: string
): Promise<{ incoming: string[]; outgoing: string[] }> => {
	if (!me) return { incoming: [], outgoing: [] }

	const [incomingRows, outgoingRows] = await Promise.all([
		db.find<{ source: string }>('relationships', {
			where: { target: me, status: 'friend-request' },
			select: ['source'],
		}),
		db.find<{ target: string }>('relationships', {
			where: { source: me, status: 'friend-request' },
			select: ['target'],
		}),
	])

	const incoming = [...new Set(incomingRows.map((row) => row.source))].filter((auth) => auth !== me)
	const incomingSet = new Set(incoming)
	const outgoing = [...new Set(outgoingRows.map((row) => row.target))].filter(
		(auth) => auth !== me && !incomingSet.has(auth)
	)

	return { incoming, outgoing }
}
