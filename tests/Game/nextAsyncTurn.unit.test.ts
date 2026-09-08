// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The "Next game" jump's answer.
 *
 * The button that calls this appears the moment the LOCAL board says the turn is
 * over, which is earlier than the room knows: `yourTurn` comes off
 * `game_room.current_turn`, and that only moves when the end-turn reaches the
 * log. So the room the player is standing in is still "your turn" while a
 * handover is in flight — and since your-turn games sort first, it was also the
 * FIRST answer. The player clicked "Next game", `goto` to the current URL did
 * nothing, and the board sat there looking untouched.
 */
const h = vi.hoisted(() => ({ games: [] as Record<string, unknown>[] }))

vi.mock('$lib/Security/serverLogs.js', () => ({ logToErrorDb: async () => {} }))
vi.mock('$lib/Game/store.server', () => ({
	gameStore: { listMyAsyncGames: async () => h.games },
}))

const { GET } = await import('../../src/routes/api/game/next-async-turn/+server')

const HERE = 'room-here'
const ELSEWHERE = 'room-elsewhere'

const game = (session: string, yourTurn: boolean) => ({ session, started: true, yourTurn })

/** Ask the endpoint, as the button does. */
const ask = async (exclude?: string) => {
	const url = new URL('https://x/api/game/next-async-turn')
	if (exclude) url.searchParams.set('exclude', exclude)
	const res = await GET({ locals: { session: 'me' }, url } as never)
	return (await res.json()).session
}

beforeEach(() => {
	h.games = []
})

describe('next async turn', () => {
	it('never answers with the room the asker is already in', async () => {
		// The order the list really comes back in: your-turn first, so the stale
		// current room leads.
		h.games = [game(HERE, true), game(ELSEWHERE, true)]
		expect(await ask(HERE)).toBe(ELSEWHERE)
	})

	it('answers null when the only game needing a move is the one being left', async () => {
		h.games = [game(HERE, true), game(ELSEWHERE, false)]
		// Null sends the button to the games list, which is a real destination —
		// unlike navigating to the page you are on.
		expect(await ask(HERE)).toBeNull()
	})

	it('still answers rooms other than the excluded one', async () => {
		h.games = [game(ELSEWHERE, true)]
		expect(await ask(HERE)).toBe(ELSEWHERE)
	})

	it('skips games that have not started', async () => {
		h.games = [{ session: 'lobby', started: false, yourTurn: true }, game(ELSEWHERE, true)]
		expect(await ask(HERE)).toBe(ELSEWHERE)
	})
})
