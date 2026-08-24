// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
	createFadeScope,
	observeFog,
	observeUnitFade,
	fogBusy,
	unitFadeBusy,
} from '../../src/lib/Engine/fogRender'

// Two boards are on screen at once during a live match: the gameplay board and
// the HUD rail's overview map. Both paint the same tile indices, so the fade
// state has to be per-board — when it wasn't, the two boards dragged one easing
// value toward opposite targets on every frame. Nothing ever settled, so fog sat
// permanently half-drawn and hidden units sat permanently half-faded (which is
// to say: visible) on both boards.
describe('fog fade scoping', () => {
	// Time only advances between paints, so a single observe call per scope is
	// enough to show the values are tracked separately.
	it('keeps each board’s tile fog independent', () => {
		const board = createFadeScope()
		const overview = createFadeScope()

		// First sight snaps to the target rather than fading up from black.
		expect(observeFog(0, 1, board)).toBe(1)
		expect(observeFog(0, 0, overview)).toBe(0)

		// The other board's opposite target must not move this one's value.
		expect(observeFog(0, 1, board)).toBe(1)
		expect(observeFog(0, 0, overview)).toBe(0)

		// Neither board is mid-fade, so the repaint pump is free to stop.
		expect(fogBusy(board)).toBe(false)
		expect(fogBusy(overview)).toBe(false)
	})

	it('keeps each board’s unit opacity independent', () => {
		const board = createFadeScope()
		const overview = createFadeScope()

		// A cloaked enemy fades to 0 for the viewer who cannot see it, while the
		// owner still reads it at half alpha.
		expect(observeUnitFade(5, 0, board)).toBe(0)
		expect(observeUnitFade(5, 0.5, overview)).toBe(0.5)
		expect(observeUnitFade(5, 0, board)).toBe(0)

		expect(unitFadeBusy(board)).toBe(false)
		expect(unitFadeBusy(overview)).toBe(false)
	})

	it('tracks a target change within one board', () => {
		const board = createFadeScope()
		expect(observeFog(9, 1, board)).toBe(1)
		// Retargeting to "visible" leaves the tile mid-fade, so the pump keeps
		// repainting until the veil has finished dissolving.
		observeFog(9, 0, board)
		expect(fogBusy(board)).toBe(true)
	})
})
