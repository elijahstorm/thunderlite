import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { gameStore, MAX_PLAYERS } from '$lib/Game/store.server'
import { getMapData } from '$lib/Map/hashLoader'
import { teamsFromHash } from '$lib/Game/mapTeams'
import { realtime } from '$lib/dontcode/server'

/**
 * Pre-game lobby seat management.
 *
 *   pick   {team}          — a player claims a side (or null = random). Blocked
 *                            when the host locked seats to random.
 *   lock   {lock}          — host toggles "everyone random" (clears all picks).
 *   addAi                  — host reserves a CPU seat (occupies capacity).
 *   remove {target}        — host frees a seat (kick a player / drop an AI).
 *   assign {target, team}  — host forces a member onto a side (or to random).
 *
 * Rules: a side can be held by only one member (first-come); null = random,
 * filled deterministically at start. Changes are refused once the match has
 * actually started.
 */
export const POST = async ({ request, params, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')
	const session = params.session
	if (!session) throw error(400, 'Missing session')

	let body: { action?: string; team?: number | null; target?: string; lock?: boolean }
	try {
		body = await request.json()
	} catch {
		throw error(400, 'Invalid JSON body')
	}
	const action = body.action

	try {
		const [room, seat, roster] = await Promise.all([
			gameStore.getRoom(session),
			gameStore.seatOf(session, userSession),
			gameStore.roster(session),
		])
		if (!room) throw error(404, 'Game session does not exist')
		if (seat < 0) throw error(403, 'You are not in this room')
		if (room.start_at != null && room.start_at <= Date.now()) {
			throw error(409, 'The match has already started')
		}
		const isHost = seat === 0

		const requireHost = () => {
			if (!isHost) throw error(403, 'Only the host can do that')
		}

		// Validate a team claim against the map's sides and current reservations.
		const validateTeam = async (team: number | null, forSession: string) => {
			if (team == null) return
			const { mapHash } = await getMapData(room.map_id)
			const teams = teamsFromHash(mapHash)
			if (!teams.includes(team)) throw error(400, 'That side is not on this map')
			const taken = roster.find((r) => r.team === team && r.userSession !== forSession)
			if (taken) throw error(409, 'That side is already taken')
		}

		switch (action) {
			case 'pick': {
				if (room.lock_random && !isHost) throw error(403, 'Seats are locked to random')
				await validateTeam(body.team ?? null, userSession)
				await gameStore.setMemberTeam(session, userSession, body.team ?? null)
				break
			}
			case 'assign': {
				requireHost()
				if (!body.target) throw error(400, 'Missing target')
				await validateTeam(body.team ?? null, body.target)
				await gameStore.setMemberTeam(session, body.target, body.team ?? null)
				break
			}
			case 'lock': {
				requireHost()
				await gameStore.setLockRandom(session, !!body.lock)
				break
			}
			case 'addAi': {
				requireHost()
				// CPU seats are live-only: the AI's turns are driven by an open human
				// client, so in an async room an offline driver would let the AI's
				// turn clock expire and gift the host a free win.
				if (room.mode === 'async') {
					throw error(400, 'CPU seats are not available in async games')
				}
				if ((await gameStore.memberCount(session)) >= MAX_PLAYERS) {
					throw error(409, 'The room is full')
				}
				const added = await gameStore.addAiMember(session)
				if (!added) throw error(409, 'Could not add an AI seat')
				// Filling the room arms the countdown, same as a human join.
				if ((await gameStore.memberCount(session)) >= MAX_PLAYERS) {
					await gameStore.armStartCountdown(session)
				}
				break
			}
			case 'remove': {
				requireHost()
				if (!body.target) throw error(400, 'Missing target')
				if (body.target === userSession) throw error(400, 'Use Leave to remove yourself')
				await gameStore.removeMember(session, body.target)
				break
			}
			default:
				throw error(400, 'Unknown lobby action')
		}

		// Nudge every lobby to re-read so seat changes show without waiting for a poll.
		await realtime.tryPublish(`game:${session}`, {
			lobby: { count: await gameStore.memberCount(session) },
		})
		return json({ ok: true })
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		logToErrorDb(msg)
		throw error(500, 'Could not update the lobby')
	}
}
