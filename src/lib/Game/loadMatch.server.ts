import { error, redirect } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { getMapData } from '$lib/Map/hashLoader'
import { parsePublicKey, type PublicKeyJwk } from '$lib/Security/frameSigning'
import { gameStore, roomSeed } from '$lib/Game/store.server'
import { queryUsersByAuth } from '$lib/Database/getUserData'
import { teamsFromHash } from '$lib/Game/mapTeams'
import { notifyAsyncYourTurn } from '$lib/Game/asyncNotify.server'
import { clampAsyncTimeout } from '$lib/Game/asyncConfig'

/** Team-keyed public profiles for the in-game player list. */
export type TeamRoster = Record<number, UserDBData>

/**
 * Everything `/play/[session]` needs to put a board on screen for one room.
 *
 * Addressing the room by session (rather than the player's single "current
 * game" pointer) is what lets a correspondence player hold several matches at
 * once: opening one no longer re-points them away from the others, so this
 * never writes the pointer.
 */
export const loadMatch = async (userSession: string, me: string, session: string) => {
	const seat = await gameStore.seatOf(session, userSession)
	if (seat < 0) throw error(403, 'You are not a member of this game room')

	const room = await gameStore.getRoom(session)
	if (!room || !room.map_id) throw error(404, 'That game room no longer exists')

	// The lobby hasn't released the match yet — send them back there rather than
	// onto an empty board that would resolve the instant win conditions run.
	if (room.start_at == null || room.start_at > Date.now()) {
		throw redirect(303, `/rooms/${session}`)
	}

	const { mapHash } = await getMapData(room.map_id)
	const asyncGame = room.mode === 'async'

	// The team a client commands is authoritative and server-owned. Derive the
	// map's stable team order, assign any unassigned member a team by seat order
	// (idempotent — a member who chose a team in the lobby keeps it), then read
	// this client's team back. This replaces the old client-side re-derivation
	// that let two players both resolve to team 0.
	const teams = await teamsFromHash(mapHash)
	// No sides means no team can be assigned, so every client falls through to
	// `teams[seat] ?? 0` and commands team 0 — including the opponent. That is an
	// unplayable room, not a degraded one, so fail loudly here instead of rendering
	// a board that looks fine and can never resolve. Room creation refuses these
	// maps now; this covers rooms opened before that guard existed.
	if (!teams.length) {
		await logToErrorDb(`Room ${session} is on map ${room.map_id}, which fields no playable sides`)
		throw error(500, 'This map has no playable sides, so the match cannot start.')
	}
	await gameStore.assignTeamsIfNeeded(session, teams)
	// Align the server's turn pointer with the engine's first team before the
	// first move, so the player on the starting side (not necessarily the host)
	// actually gets turn one.
	const starter = await gameStore.seedFirstTurn(session, teams)
	// Async: the game may be released by the OTHER player's load (the host can
	// be offline when the lobby fills). If the first move belongs to someone
	// who isn't here, email them — deduped, so repeat loads send it once.
	if (asyncGame && starter && starter.userSession !== userSession) {
		await notifyAsyncYourTurn({
			session,
			eventId: 'seed',
			nextUserAuth: starter.userAuth,
			opponentAuth: null,
			turnTimeoutMs: clampAsyncTimeout(room.turn_timeout_ms),
		})
	}

	const [localTeam, roster, seats, aiDriver] = await Promise.all([
		gameStore.teamOf(session, userSession),
		buildTeamRoster(session, me),
		gameStore.roster(session),
		gameStore.aiDriver(session),
	])

	// Teams run by a CPU seat, and whether THIS client is the one that drives them
	// (the lowest-seat human relays the AI's moves — see GameStateManager).
	const aiTeams = seats.filter((s) => s.isAi && s.team != null).map((s) => s.team as number)
	// Each seat's frame-signing key, for verifying the live frames it publishes.
	// A seat that has not registered yet is absent; the socket asks again when it
	// meets a sender it has no key for.
	const memberKeys: Record<string, PublicKeyJwk> = {}
	for (const s of seats) {
		const key = parsePublicKey(s.pubkey)
		if (key) memberKeys[s.userSession] = key
	}

	return {
		userSession,
		gameSession: session,
		seat,
		memberKeys,
		// Authoritative: the side this client commands. Falls back to the seat's
		// team only if assignment somehow didn't land (e.g. a map with no teams).
		localTeam: localTeam ?? teams[seat] ?? 0,
		// Profiles keyed by TEAM (not seat) so the player list keys straight off
		// the engine's team ids.
		roster,
		aiTeams,
		isAiDriver: aiDriver === userSession,
		mapHash,
		// Async turn clock, for the in-game countdown chip. The event poll keeps
		// the deadline fresh after this initial value.
		asyncGame,
		turnDeadline: room.turn_deadline == null ? null : Number(room.turn_deadline),
		turnTimeoutMs: room.turn_timeout_ms == null ? null : Number(room.turn_timeout_ms),
		// The room's seed, so every client — including one that rejoins mid-match —
		// resolves scripted spawns and CPU tie-breaks the same way.
		seed: roomSeed(room),
	}
}

/**
 * Team-keyed public profiles for the room's players, using each member's
 * server-assigned team. A team with no resolvable profile (AI seat, legacy row,
 * or a removed profile) is simply absent, and the player list falls back to a
 * generic label for it.
 */
const buildTeamRoster = async (gameSession: string, me: string): Promise<TeamRoster> => {
	try {
		const seats = await gameStore.roster(gameSession)
		const auths = seats.map((s) => s.userAuth).filter((a): a is string => !!a)
		const byAuth = new Map((await queryUsersByAuth(auths, me)).map((u) => [u.auth, u]))
		const out: TeamRoster = {}
		for (const seat of seats) {
			if (seat.team == null || !seat.userAuth) continue
			const user = byAuth.get(seat.userAuth)
			if (user) out[seat.team] = user
		}
		return out
	} catch (msg) {
		// A roster failure must never take down the match — degrade to "Player N".
		await logToErrorDb(msg)
		return {}
	}
}
