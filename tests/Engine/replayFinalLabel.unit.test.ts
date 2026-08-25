// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { replayFinalLabel } from '../../src/lib/Components/Replay/finalLabel'

const name = (team: number | null) => (team == null ? 'Nobody' : `Player ${team + 1}`)

describe('replayFinalLabel', () => {
	it('reports the winner the replayed log itself produced', () => {
		expect(replayFinalLabel({ phase: 'gameOver', winner: 1 }, 1, name)).toBe('Player 2 wins')
	})

	it('prefers the log over a match row that disagrees with it', () => {
		// The row said team 3; replaying the log the viewer just watched said team 1.
		expect(replayFinalLabel({ phase: 'gameOver', winner: 1 }, 3, name)).toBe('Player 2 wins')
	})

	it('calls a log that resolved with no survivor a draw', () => {
		expect(replayFinalLabel({ phase: 'gameOver', winner: undefined }, 2, name)).toBe('Draw')
	})

	it('does not assert an outcome for a log that stops mid-match', () => {
		// Match 19: the row names team 1, but the log ends on an attack with two
		// sides still standing. The banner used to claim "Player 2 wins" there.
		const label = replayFinalLabel({ phase: 'playing' }, 1, name)
		expect(label).toContain('Log ends mid-match')
		expect(label).toContain('Player 2')
		expect(label).not.toMatch(/^Player 2 wins$/)
	})

	it('says only that the log stops when there is no recorded winner either', () => {
		expect(replayFinalLabel({ phase: 'playing' }, null, name)).toBe('Log ends mid-match')
	})
})
