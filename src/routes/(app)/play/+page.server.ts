import { error, redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { dev } from '$app/environment'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { gameStore } from '$lib/Game/store.server'
import { getMapData } from '$lib/Map/hashLoader'

/**
 * `/play` without a room code. Two jobs, both of them hand-offs:
 *
 *  - `?ephemeral=1` — the editor launched an unsaved map. There is no room to
 *    address, so this renders straight from the client-side `mapStore`.
 *  - otherwise — resolve the player's most recent room and forward to
 *    `/play/[session]`, which is where matches actually live. Kept so older
 *    links, the live lobby's hand-off, and bookmarks all still land somewhere.
 */
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
			roster: {},
			memberKeys: {},
			aiTeams: [] as number[],
			isAiDriver: false,
			asyncGame: false,
			turnDeadline: null,
			turnTimeoutMs: null,
			// No room, so no shared seed to honour — the client rolls a fresh one
			// per match (see Engine/matchSeed).
			seed: null as number | null,
		}
	}

	try {
		const current = await gameStore.currentGame(userSession)
		if (current) throw redirect(303, `/play/${current.session}`)
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		await logToErrorDb(msg)
		throw error(500, 'Could not load game session')
	}

	// No active room — the last match ended (its pointer was cleared), or the
	// player left. In dev, boot a fixed local skirmish so hitting `/play`
	// directly still puts a board on screen; in prod, their games are the only
	// useful place to be.
	if (!dev) throw redirect(303, '/games')

	const { mapHash } = await getMapData('hello')
	return {
		userSession,
		gameSession: 'testSession',
		mapHash,
		seat: 0,
		localTeam: 0,
		roster: {},
		memberKeys: {},
		aiTeams: [] as number[],
		isAiDriver: false,
		asyncGame: false,
		turnDeadline: null,
		turnTimeoutMs: null,
		seed: null as number | null,
	}
}
