import { db } from '$lib/dontcode/server'

/**
 * Block reads, shared by every surface that has to honour one.
 *
 * `relationships` rows are directed, so a block only ever exists on the
 * blocker's row. Almost nothing that matters cares WHO blocked WHOM though: a
 * conversation is dead either way. So these helpers report both directions and
 * a collapsed `blocked` that the enforcement points actually gate on.
 *
 * Deliberately not exposed to the client per-direction: telling someone "they
 * blocked you" is information a block is meant to withhold. The UI is told only
 * that the pair is blocked.
 */

export interface BlockState {
	/** The viewer blocked the other player. Only this direction is undoable by them. */
	blockedByMe: boolean
	/** The other player blocked the viewer. */
	blockedMe: boolean
	/** Either direction. This is what enforcement gates on. */
	blocked: boolean
}

const UNBLOCKED: BlockState = { blockedByMe: false, blockedMe: false, blocked: false }

/** Where one pair stands. Cheap enough to call on a send path (two indexed reads). */
export const getBlockState = async (me: string, other: string): Promise<BlockState> => {
	if (!me || !other || me === other) return UNBLOCKED

	const [mine, theirs] = await Promise.all([
		db.findOne<{ status: RelationshipStatus }>('relationships', {
			where: { source: me, target: other, status: 'blocked' },
			select: ['status'],
		}),
		db.findOne<{ status: RelationshipStatus }>('relationships', {
			where: { source: other, target: me, status: 'blocked' },
			select: ['status'],
		}),
	])

	const blockedByMe = !!mine
	const blockedMe = !!theirs
	return { blockedByMe, blockedMe, blocked: blockedByMe || blockedMe }
}

/**
 * Everyone the viewer cannot see or be seen by, in one wave. Pass `candidates`
 * when the caller already has a bounded set (a page of profiles, a presence
 * list) so the reads stay indexed instead of pulling the viewer's whole block
 * list; omit it to get every block the viewer is party to.
 */
export const blockedAuths = async (me: string, candidates?: string[]): Promise<Set<string>> => {
	if (!me) return new Set()
	if (candidates && candidates.length === 0) return new Set()

	const scoped = candidates ? { in: candidates } : undefined

	const [mine, theirs] = await Promise.all([
		db.find<{ target: string }>('relationships', {
			where: { source: me, status: 'blocked', ...(scoped ? { target: scoped } : {}) },
			select: ['target'],
		}),
		db.find<{ source: string }>('relationships', {
			where: { target: me, status: 'blocked', ...(scoped ? { source: scoped } : {}) },
			select: ['source'],
		}),
	])

	return new Set([...mine.map((row) => row.target), ...theirs.map((row) => row.source)])
}
