import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { gameStore, roomCapacity } from '$lib/Game/store.server'
import { getMapData } from '$lib/Map/hashLoader'
import { teamsFromHash } from '$lib/Game/mapTeams'
import { realtime } from '$lib/dontcode/server'

/**
 * Pre-game lobby seat management.
 *
 *   pick   {team}          — a player claims a side (or null = random). Blocked
 *                            when the host locked seats to random.
 *   lock   {lock}          — host toggles "everyone random" (clears all picks).
 *   addAi  {team}          — host reserves a CPU seat on that side (or random;
 *                            occupies capacity like a human seat).
 *   remove {target}        — host frees a seat (kick a player / drop an AI).
 *   assign {target, team}  — host forces a member onto a side (or to random).
 *   ready  {ready}         — a player (un)readies. Live rooms only; the
 *                            countdown arms when every human seat is ready.
 *
 * Rules: a side can be held by only one member (first-come); null = random,
 * filled deterministically at start. Changes are refused once the match has
 * actually started.
 *
 * Every action EXCEPT `ready` changes the lineup, so each one un-readies the
 * whole room: a ready given for one setup must never launch a different one.
 * That also disarms a countdown already ticking, which is the point — a seat
 * swap or a kick at t-3s should stop the match, not race it.
 */
export const POST = async ({ request, params, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')
	const session = params.session
	if (!session) throw error(400, 'Missing session')

	let body: {
		action?: string
		team?: number | null
		target?: string
		lock?: boolean
		ready?: boolean
	}
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
			const teams = await teamsFromHash(mapHash)
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
				if ((await gameStore.memberCount(session)) >= roomCapacity(room)) {
					throw error(409, 'The room is full')
				}
				// Pin the CPU to the side the host clicked. This used to be dropped,
				// so "Add AI" on side 3 produced a CPU that team assignment then
				// parked on the first free side instead — leaving the side the host
				// meant to fill with no commander, which deadlocks the match.
				const team = body.team ?? null
				await validateTeam(team, `ai-pending-${session}`)
				const added = await gameStore.addAiMember(session, team)
				if (!added) throw error(409, 'Could not add an AI seat')
				// Filling the room no longer starts anything by itself: the host
				// still has to ready up (the shared re-evaluation below arms it).
				break
			}
			case 'remove': {
				requireHost()
				if (!body.target) throw error(400, 'Missing target')
				if (body.target === userSession) throw error(400, 'Use Leave to remove yourself')
				await gameStore.removeMember(session, body.target)
				break
			}
			case 'ready': {
				// Async rooms never gate on readiness — see the store's `canStart`.
				if (room.mode === 'async') {
					throw error(400, 'Async games do not use ready-up')
				}
				await gameStore.setMemberReady(session, userSession, !!body.ready)
				break
			}
			default:
				throw error(400, 'Unknown lobby action')
		}

		// A lineup change invalidates everyone's readiness (see the note above);
		// readying up is the one action that doesn't.
		if (action !== 'ready') await gameStore.clearReady(session)

		// Re-evaluate the countdown against the new state: arm it if the room now
		// qualifies, and stand it down if it no longer does (someone un-readied, or
		// the change above cleared the room's readiness under a running clock).
		const fresh = await gameStore.getRoom(session)
		const clearedToStart = await gameStore.canStart(session, fresh)
		let startAt: number | null = fresh?.start_at == null ? null : Number(fresh.start_at)
		if (clearedToStart && startAt == null) {
			startAt = await gameStore.armStartCountdown(session)
		} else if (!clearedToStart && startAt != null && startAt > Date.now()) {
			await gameStore.disarmCountdown(session)
			startAt = null
		}

		// Nudge every lobby to re-read so seat/ready changes show without waiting
		// for a poll. `startAt` rides along (null included) so a countdown that
		// just armed — or just stood down — lands on every client immediately.
		await realtime.tryPublish(`game:${session}`, {
			lobby: { count: await gameStore.memberCount(session), startAt },
		})
		return json({ ok: true, startAt })
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		await logToErrorDb(msg)
		throw error(500, 'Could not update the lobby')
	}
}
