// Quick opacity fade-in for a freshly *built* unit — one bought from a factory or
// rolled out by a Warmachine. This is a routine, in-turn action that happens a lot,
// so it wants a fast, clean cue rather than the campaign spawn's showy pixel
// assemble (see materialize.ts): a smooth alpha ramp reads apart from that chunky
// dissolve at a glance and never holds up the turn.
//
// It's a plain per-tile alpha the unit painter multiplies in — no overlay, no
// deferral, no input gating. The unit is on the board immediately; it just fades
// up over a couple of frames.

import { simulationActive } from './shadowStore'

const FADE_MS = 240

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

const active = new Map<number, number>() // tile → start timestamp (ms)

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : 0)

// Start a fade-in for the unit on `tile`. No-op without a real clock (headless/
// test) so the unit simply shows at full opacity.
// Also a no-op while the CPU is simulating: a build on a hypothetical board must not
// fade the unit standing on that tile of the REAL one.
export const beginBuildFade = (tile: number): void => {
	if (typeof performance === 'undefined') return
	if (simulationActive()) return
	active.set(tile, performance.now())
}

// Opacity (0..1) for the unit on `tile`; 1 when no fade is running. Eased with a
// gentle ease-out so it arrives quickly then settles. Prunes on completion.
export const observeBuildFade = (tile: number): number => {
	const start = active.get(tile)
	if (start === undefined) return 1
	const t = (nowMs() - start) / FADE_MS
	if (t >= 1) {
		active.delete(tile)
		return 1
	}
	const p = clamp01(t)
	return 1 - (1 - p) * (1 - p) // easeOutQuad
}

// True while any unit is still fading up — keeps the render pump alive so the fade
// plays smoothly rather than in coarse 200ms ticks. Prunes as it scans.
export const buildFadeBusy = (): boolean => {
	const t = nowMs()
	let busy = false
	for (const [tile, start] of active) {
		if (t - start >= FADE_MS) active.delete(tile)
		else busy = true
	}
	return busy
}

// Drop every fade. Called when the board's map data is swapped so a mid-fade unit
// can't leak onto the new map.
export const clearBuildFade = (): void => {
	active.clear()
}
