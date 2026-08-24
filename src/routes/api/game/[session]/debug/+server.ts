import { error, json } from '@sveltejs/kit'
import { dev } from '$app/environment'
import { gameStore } from '$lib/Game/store.server'
import { getMapData } from '$lib/Map/hashLoader'
import { teamsFromHash } from '$lib/Game/mapTeams'

/**
 * Dev-only inspection of a room's authoritative seat/team/turn state, so we can
 * see EXACTLY what the server thinks (map sides, each member's assigned team,
 * whose turn it is, and this caller's resolved localTeam) instead of guessing
 * from in-game symptoms. Hit it from each browser and compare.
 */
export const GET = async ({ params, locals }) => {
	if (!dev) throw error(404, 'Not found')
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')
	const session = params.session
	if (!session) throw error(400, 'Missing session')

	const room = await gameStore.getRoom(session)
	if (!room) throw error(404, 'Room not found')

	const [seats, currentTurn, myTeam, mySeat, aiDriver] = await Promise.all([
		gameStore.roster(session),
		gameStore.currentTurn(session),
		gameStore.teamOf(session, userSession),
		gameStore.seatOf(session, userSession),
		gameStore.aiDriver(session),
	])

	let mapTeams: number[] = []
	try {
		mapTeams = await teamsFromHash((await getMapData(room.map_id)).mapHash)
	} catch {
		mapTeams = []
	}

	const short = (s: string | null) => (s ? `${s.slice(0, 8)}…` : null)

	return json({
		you: {
			userSession: short(userSession),
			seat: mySeat,
			localTeam: myTeam ?? mapTeams[mySeat] ?? 0,
			teamOf: myTeam,
			isCurrentTurn: currentTurn === userSession,
			isAiDriver: aiDriver === userSession,
		},
		room: {
			session,
			mapId: room.map_id,
			mapTeams,
			startingTeam: mapTeams[0] ?? null,
			currentTurn: short(currentTurn),
			startAt: room.start_at,
			lockRandom: room.lock_random,
		},
		members: seats.map((s) => ({
			userSession: short(s.userSession),
			seat: s.seat,
			team: s.team,
			isAi: s.isAi,
			isMe: s.userSession === userSession,
			hasCurrentTurn: currentTurn === s.userSession,
		})),
	})
}
