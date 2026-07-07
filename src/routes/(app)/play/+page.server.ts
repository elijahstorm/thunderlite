import { error, redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { dev } from '$app/environment'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { getMapData } from '$lib/Map/hashLoader'
import { gameStore } from '$lib/Game/store.server'
import { queryUsersByAuth } from '$lib/Database/getUserData'
import { deriveFromHash } from '$lib/Map/Editor/mapExporter'
import { derivePlayersFromMap } from '$lib/Engine/gameState'

/** Team-keyed public profiles for the in-game player list. */
type TeamRoster = Record<number, UserDBData>

export const load: PageServerLoad = async ({ locals, url }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')

	// Ephemeral session: the editor launched an unsaved map. The client-side
	// `mapStore` carries the whole board across navigation (no map id, nothing
	// stuffed in the URL), and `MapLoader` prefers `$mapStore` over `mapHash`, so
	// this renders from memory. A hard reload with an empty store has nothing to
	// show — the editor is the source of truth for an unsaved map.
	if (url.searchParams.get('ephemeral') === '1') {
		return {
			userSession,
			gameSession: 'ephemeral',
			mapHash: '',
			seat: 0,
			localTeam: 0,
			roster: {} as TeamRoster,
		}
	}

	const { gameSession, mapId, seat } = await getGameSession(userSession)
	if (!gameSession || !mapId) throw error(403, 'No game session found')

	const { mapHash } = await getMapData(mapId)

	// The team a client commands is authoritative and server-owned. Derive the
	// map's stable team order, assign any unassigned member a team by seat order
	// (idempotent — a member who chose a team in the lobby keeps it), then read
	// this client's team back. This replaces the old client-side re-derivation
	// that let two players both resolve to team 0.
	const teams = teamsFromHash(mapHash)
	if (teams.length) await gameStore.assignTeamsIfNeeded(gameSession, teams)

	const [localTeam, roster] = await Promise.all([
		gameStore.teamOf(gameSession, userSession),
		buildTeamRoster(gameSession, locals.user ?? ''),
	])

	return {
		userSession,
		gameSession,
		seat,
		// Authoritative: the side this client commands. Falls back to the seat's
		// team only if assignment somehow didn't land (e.g. a map with no teams).
		localTeam: localTeam ?? teams[seat] ?? 0,
		// Profiles keyed by TEAM (not seat) so the player list keys straight off
		// the engine's team ids.
		roster,
		mapHash,
	}
}

/** The map's teams in the engine's stable order (ascending). Empty on decode failure. */
const teamsFromHash = (hash: string): number[] => {
	if (!hash) return []
	try {
		return derivePlayersFromMap(deriveFromHash(hash)).map((player) => player.team)
	} catch (msg) {
		logToErrorDb(msg)
		return []
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
		logToErrorDb(msg)
		return {}
	}
}

const getGameSession = async (userSession: string) => {
	try {
		const current = await gameStore.currentGame(userSession)
		if (!current) {
			// No active room. In dev, fall back to a fixed local skirmish so hitting
			// `/play` directly still boots a board. In prod there's nothing to show.
			// NB: this fallback must only fire when there's genuinely no room —
			// firing it unconditionally in dev made every client seat 0 on a
			// non-multiplayer `testSession`, so two lobby players both drove player 1
			// and never synced.
			if (dev) return { gameSession: 'testSession', mapId: 'hello', seat: 0 }
			return {}
		}
		const seat = await gameStore.seatOf(current.session, userSession)
		if (seat < 0) {
			throw error(403, 'You are not a member of this game room')
		}
		// The match hasn't been released by the lobby yet — send the player back to
		// the lobby (where the fill/countdown plays out) instead of dropping them
		// into an empty board that would end the instant win conditions evaluate.
		// `currentGame` already fetched the room, so reuse it here.
		const room = current.room
		if (!room || room.start_at == null || room.start_at > Date.now()) {
			throw redirect(303, `/rooms/${current.session}`)
		}
		return { gameSession: current.session, mapId: current.mapId, seat }
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		logToErrorDb(msg)
		throw error(500, 'Could not load game session')
	}
}
