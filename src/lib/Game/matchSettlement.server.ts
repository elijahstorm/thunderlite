import { db } from '$lib/dontcode/server'
import { gameStore } from '$lib/Game/store.server'
import { DEFAULT_ELO, eloUpdatesFor1v1, type EloUpdate } from '$lib/progression'

/**
 * matchSettlement — one-shot bookkeeping for an online match the moment its
 * winner is locked (the first `matches.session_id` writer in the result
 * endpoint). Runs exactly once per match because only that first writer calls
 * it; later writers read the settled row back instead.
 *
 * It does two things the per-caller result flow can't:
 *
 *  - Writes a `match_players` row for EVERY human seat from the server-side
 *    roster, not just the caller's own claim. A loser who closes the tab and
 *    never POSTs still gets their loss (and rating change) recorded, so the
 *    history and the ladder can't be dodged. The caller's own follow-up insert
 *    is conflict-ignored against these rows.
 *
 *  - Applies elo for rated games: exactly two seats, both human, distinct
 *    accounts, both teams known. Anything else (CPU seat, FFA map, missing
 *    team assignment, self-play) records history but leaves ratings alone.
 *    Ratings persist in `user_stats.elo` (seeded at DEFAULT_ELO); each side's
 *    before/delta also lands on its `match_players` row so history can show
 *    "+12" without replaying the ladder.
 *
 * Best-effort like the rest of post-match bookkeeping (emails, pointers): the
 * caller logs-and-continues on failure rather than 500ing an already-recorded
 * result. Ordering favors history over the ladder: player rows first, then
 * rating movement, then the `matches.rated` flag last so the flag is only set
 * once the ladder actually moved.
 */

type Outcome = 'win' | 'loss' | 'draw'

const outcomeFor = (winner: number | null, team: number): Outcome =>
	winner === null ? 'draw' : winner === team ? 'win' : 'loss'

type HumanSeat = { userAuth: string; team: number }

/** A player's current ladder rating, seeded at DEFAULT_ELO before any rated game. */
const currentElo = async (auth: string): Promise<number> => {
	const row = await db.findOne<{ elo: number | null }>('user_stats', {
		where: { user_auth: auth },
		select: ['elo'],
	})
	return row?.elo == null ? DEFAULT_ELO : Number(row.elo)
}

export const settleOnlineMatch = async (args: {
	matchId: number
	session: string
	winnerTeam: number | null
}): Promise<void> => {
	const { matchId, session, winnerTeam } = args

	const roster = await gameStore.roster(session)
	const humans: HumanSeat[] = roster
		.filter((m) => !m.isAi && m.userAuth && m.team != null)
		.map((m) => ({ userAuth: m.userAuth as string, team: m.team as number }))

	const rated =
		roster.length === 2 &&
		humans.length === 2 &&
		humans[0].userAuth !== humans[1].userAuth &&
		humans[0].team !== humans[1].team

	const updates = new Map<string, EloUpdate>()
	if (rated) {
		const [a, b] = humans
		const [ratingA, ratingB] = await Promise.all([currentElo(a.userAuth), currentElo(b.userAuth)])
		const scoreA = winnerTeam === null ? 0.5 : winnerTeam === a.team ? 1 : 0
		const [updateA, updateB] = eloUpdatesFor1v1(ratingA, ratingB, scoreA)
		updates.set(a.userAuth, updateA)
		updates.set(b.userAuth, updateB)
	}

	// History rows for every human seat, from the server-assigned teams and the
	// locked winner. Upsert, not insert: a participant racing their own result
	// POST past the winner lock can land a bare row first, and settlement must
	// still stamp the elo columns onto it rather than silently losing them.
	for (const seat of humans) {
		const update = updates.get(seat.userAuth)
		await db.upsert(
			'match_players',
			{ match_id: matchId, user_auth: seat.userAuth },
			{
				team: seat.team,
				outcome: outcomeFor(winnerTeam, seat.team),
				...(update ? { elo_before: update.before, elo_delta: update.delta } : {}),
			}
		)
	}

	if (rated) {
		for (const [auth, update] of updates) {
			await db.upsert('user_stats', { user_auth: auth }, { elo: update.before + update.delta })
		}
		await db.update('matches', { id: matchId }, { rated: true })
	}
}
