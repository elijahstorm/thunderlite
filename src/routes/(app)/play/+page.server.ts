import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { dev } from '$app/environment'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { getMapHash } from '$lib/Map/hashLoader'
import { gameStore } from '$lib/Game/store.server'

export const load: PageServerLoad = async ({ locals, url }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')

	// Ephemeral session: the editor launched an unsaved map. The client-side
	// `mapStore` already holds the map, so we skip the DB lookup. `MapLoader`
	// prefers `$mapStore` over `mapHash`, so this still renders correctly.
	if (url.searchParams.get('ephemeral') === '1') {
		return {
			userSession,
			gameSession: 'ephemeral',
			mapHash: url.searchParams.get('sha') ?? '',
		}
	}

	const { gameSession, sha } = await getGameSession(userSession)
	if (!gameSession || !sha) throw error(403, 'No game session found')

	return {
		userSession,
		gameSession,
		...(await getMapHash(sha)),
	}
}

const getGameSession = async (userSession: string) => {
	if (dev) {
		return { gameSession: 'testSession', sha: 'hello' }
	}

	try {
		const current = await gameStore.currentGame(userSession)
		if (!current) return {}
		if (!(await gameStore.isMember(current.session, userSession))) {
			throw error(403, 'You are not a member of this game room')
		}
		return { gameSession: current.session, sha: current.sha }
	} catch (msg) {
		if (msg && typeof msg === 'object' && 'status' in msg) throw msg
		logToErrorDb(msg)
		throw error(500, 'Could not load game session')
	}
}
