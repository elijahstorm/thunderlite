import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/svelte'
import { get } from 'svelte/store'
import { tick } from 'svelte'
import StatsScreen from '$lib/Engine/HUD/StatsScreen.svelte'
import ResultsButton from '$lib/Engine/HUD/ResultsButton.svelte'
import TurnTransition from '$lib/Engine/HUD/TurnTransition.svelte'
import { gameState, resetGameState } from '$lib/Engine/gameState'
import { emitMatchEnd, resetMatchEnd, type MatchResult } from '$lib/Engine/matchEnd'
import { resultsDismissed } from '$lib/Engine/HUD/resultsPanelStore'
import { setHudGutter, clearHudGutter } from '$lib/Engine/HUD/hudInsets'
import { turnTransitionActive } from '$lib/Engine/HUD/turnTransitionStore'

/**
 * Match overlays used to be `fixed inset-0`: the results screen and the
 * "Your Turn" card covered the HUD rail and the chat docks and ate every click
 * on them, and the results could only be left by leaving the match — so nobody
 * could look at the finished board. They now live in the board region (left of
 * the rail, under the chrome) and the results panel can be put away and
 * brought back from the rail.
 */
const RAIL_PX = 264

// jsdom has no Web Animations, and Svelte 5 drives `transition:` through
// `element.animate`. Finish every animation on the next tick so outros actually
// remove their element instead of throwing.
beforeEach(() => {
	Element.prototype.animate = function animate() {
		const animation = {
			currentTime: 0,
			onfinish: null as null | (() => void),
			cancel() {},
			pause() {},
			play() {},
		}
		setTimeout(() => animation.onfinish?.(), 0)
		return animation as unknown as Animation
	}
})

const result = (): MatchResult => ({
	mode: 'hotseat',
	winner: 1,
	players: [
		{ team: 0, outcome: 'loss', isLocal: true, isCpu: false },
		{ team: 1, outcome: 'win', isLocal: false, isCpu: true },
	],
	turns: 7,
	endedAt: 123,
})

const endMatch = () => {
	emitMatchEnd(result())
	gameState.update((s) => ({ ...s, phase: 'gameOver', winner: 1 }))
}

describe('results panel stays clear of the rail and can be put away', () => {
	beforeEach(() => {
		resetGameState()
		resetMatchEnd()
		resultsDismissed.set(false)
		setHudGutter(RAIL_PX)
	})
	afterEach(() => {
		cleanup()
		clearHudGutter()
	})

	it('spans the board region only, leaving the rail beneath it untouched', () => {
		endMatch()
		const { getByTestId } = render(StatsScreen, { props: { localTeam: 0 } })
		const panel = getByTestId('stats-screen') as HTMLElement

		expect(panel.style.right).toBe(`${RAIL_PX}px`)
		expect(panel.className).not.toContain('inset-0')
	})

	it('the close button, the board veil and Escape each put the report away', async () => {
		endMatch()
		const { getByTestId } = render(StatsScreen, { props: { localTeam: 0 } })

		await fireEvent.click(getByTestId('stats-close'))
		expect(get(resultsDismissed)).toBe(true)

		resultsDismissed.set(false)
		await tick()
		await fireEvent.click(getByTestId('stats-backdrop'))
		expect(get(resultsDismissed)).toBe(true)

		resultsDismissed.set(false)
		await tick()
		await fireEvent.keyDown(window, { key: 'Escape' })
		expect(get(resultsDismissed)).toBe(true)
	})

	it('the rail button brings the report back, and reads its state', async () => {
		endMatch()
		const { getByTestId } = render(ResultsButton)
		const button = getByTestId('results-toggle') as HTMLButtonElement
		expect(button.getAttribute('aria-pressed')).toBe('true')

		await fireEvent.click(button)
		expect(get(resultsDismissed)).toBe(true)
		expect(button.getAttribute('aria-pressed')).toBe('false')
		expect(button.getAttribute('aria-label')).toBe('Show results')

		await fireEvent.click(button)
		expect(get(resultsDismissed)).toBe(false)
	})

	it('a new match opens its results fresh', async () => {
		endMatch()
		render(StatsScreen, { props: { localTeam: 0 } })
		resultsDismissed.set(true)

		gameState.update((s) => ({ ...s, phase: 'playing', winner: undefined }))
		await tick()

		expect(get(resultsDismissed)).toBe(false)
	})
})

describe('the turn card is confined to the board region', () => {
	beforeEach(() => {
		resetGameState()
		turnTransitionActive.set(false)
		setHudGutter(RAIL_PX)
	})
	afterEach(() => {
		cleanup()
		clearHudGutter()
	})

	it('leaves the rail and chat docks beside it clickable', async () => {
		const { getByTestId, queryByTestId } = render(TurnTransition, { props: { localTeam: 0 } })
		expect(queryByTestId('turn-transition')).toBeNull()

		gameState.update((s) => ({ ...s, currentTeam: 1 }))
		await tick()

		const card = getByTestId('turn-transition') as HTMLElement
		expect(card.style.right).toBe(`${RAIL_PX}px`)
		expect(card.className).not.toContain('inset-0')
		expect(get(turnTransitionActive)).toBe(true)
	})
})
