/**
 * speakerColors — per-character voice colours for the campaign dialogue overlay.
 *
 * Colouring each speaker's name, line text, and the overlay's accent border makes
 * it obvious when a line changes hands. A colour is a plain CSS colour string (a
 * hex code or a CSS colour name) so the renderer can apply it inline and any value
 * a custom-map author picks just works.
 *
 * Resolution order for a speaker: a per-level script override (set by the
 * `color <Speaker>: <hex>` command) wins, then a built-in for the campaign cast,
 * then a neutral default. Custom maps drive this entirely from their own scripts.
 */

import { get, writable } from 'svelte/store'

/** Built-in voice colours for the campaign cast. */
const BUILTIN: Record<string, string> = {
	Vance: '#38bdf8', // mentor — vivid sky blue
	Reyes: '#4ade80', // protege — vivid green
	Kael: '#ef4444', // enemy commander — vivid red
}

/** Colour for any speaker without an override or a built-in. */
export const DEFAULT_SPEAKER_COLOR = '#fbbf24' // amber

/**
 * Per-level speaker colour overrides, set by the `color` script command and
 * cleared on each level load. Keyed by speaker name → CSS colour.
 */
export const speakerColorOverrides = writable<Record<string, string>>({})

/** Record (or replace) a speaker's colour for the current level. */
export const setSpeakerColorOverride = (speaker: string, color: string): void =>
	speakerColorOverrides.update((m) => ({ ...m, [speaker.trim()]: color }))

/** Forget all script overrides (call when a new level loads). */
export const resetSpeakerColors = (): void => speakerColorOverrides.set({})

/** Resolve a speaker's CSS colour: script override → built-in → default. */
export const resolveSpeakerColor = (
	speaker: string,
	overrides: Record<string, string> = get(speakerColorOverrides)
): string => overrides[speaker.trim()] ?? BUILTIN[speaker.trim()] ?? DEFAULT_SPEAKER_COLOR
