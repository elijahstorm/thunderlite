import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/svelte'
import EndTurnButton from '$lib/Engine/HUD/EndTurnButton.svelte'
import { gameState, resetGameState } from '$lib/Engine/gameState'
import { turnTransitionActive } from '$lib/Engine/HUD/turnTransitionStore'
import { controlsTeam } from '$lib/Engine/turnOwnership'

/**
 * The End Turn button used to decide for itself whether the turn was endable,
 * from a `cpuOpponent` flag that was FALSE for every online match. So in a live
 * game the button stayed live on the opponent's turn: pressing it ended their
 * turn on this client only (the relay came back 'Not your turn'), leaving the
 * two boards on different turns for the rest of the match. Ownership is now the
 * parent's answer to give, and the button must honour it.
 */
const setTurn = (team: number) => gameState.update((s) => ({ ...s, currentTeam: team }))

describe('EndTurnButton only ends turns the client owns', () => {
	beforeEach(() => {
		resetGameState()
		turnTransitionActive.set(false)
		setTurn(0)
	})
	afterEach(() => cleanup())

	it('is live, and fires, when the turn is ours', async () => {
		let ended = 0
		const { getByTestId } = render(EndTurnButton, {
			props: { canEndTurn: true, onEndTurn: () => (ended += 1) },
		})
		const button = getByTestId('end-turn-button') as HTMLButtonElement

		expect(button.disabled).toBe(false)
		expect(button.getAttribute('aria-label')).toBe('End Turn')
		await fireEvent.click(button)

		expect(ended).toBe(1)
	})

	it("is dead, and says so, on the opponent's turn", () => {
		const { getByTestId } = render(EndTurnButton, { props: { canEndTurn: false } })
		const button = getByTestId('end-turn-button') as HTMLButtonElement

		// A real browser won't deliver a click to a disabled button (jsdom's
		// synthetic dispatch does, which is why the click isn't asserted here) — and
		// `controlsTeam` below is the guard that catches anything that gets through.
		expect(button.disabled).toBe(true)
		expect(button.getAttribute('aria-label')).toBe("Opponent's turn")
	})

	it('reads Match over once the game is decided', () => {
		gameState.update((s) => ({ ...s, phase: 'gameOver' }))
		const { getByTestId } = render(EndTurnButton, { props: { canEndTurn: true } })
		const button = getByTestId('end-turn-button') as HTMLButtonElement

		expect(button.disabled).toBe(true)
		expect(button.getAttribute('aria-label')).toBe('Match over')
	})
})

/**
 * The funnel guard behind the button: every end-turn (button, auto-end, stall
 * watchdog, relayed CPU turn) goes through `handleEndTurn`, which refuses any
 * team this client doesn't command. Same rule the move endpoint enforces.
 */
describe("controlsTeam mirrors the server's whose-turn rule", () => {
	it('offline, this client runs every seat', () => {
		expect(controlsTeam({ team: 1, localTeam: 0, isMultiplayer: false })).toBe(true)
	})

	it('online, only our own seat', () => {
		expect(controlsTeam({ team: 0, localTeam: 0, isMultiplayer: true })).toBe(true)
		expect(controlsTeam({ team: 1, localTeam: 0, isMultiplayer: true })).toBe(false)
	})

	it('online, the designated driver also commands its CPU seats', () => {
		const seat = { team: 2, localTeam: 0, isMultiplayer: true, aiTeams: [2] }
		expect(controlsTeam({ ...seat, isAiDriver: true })).toBe(true)
		expect(controlsTeam({ ...seat, isAiDriver: false })).toBe(false)
		// A driver still has no claim on a HUMAN opponent's seat.
		expect(
			controlsTeam({ team: 1, localTeam: 0, isMultiplayer: true, isAiDriver: true, aiTeams: [2] })
		).toBe(false)
	})
})
