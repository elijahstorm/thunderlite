/**
 * Logical-name → file-path map for the ThunderLite audio bank.
 *
 * Paths are stored WITHOUT an extension; the engine appends `.ogg` or `.mp3`
 * after negotiating the preferred format via `canPlayType`. Everything lives
 * under `static/game/sounds/`, served from the site root at `/game/sounds/...`.
 */

export type AudioFormat = 'ogg' | 'mp3'
export type AudioChannel = 'music' | 'sfx' | 'env'

const ROOT = '/game/sounds'

/**
 * Music tracks on the single-active `music` channel.
 *
 * Two distinct kinds live here:
 *
 *  - `layers/*` are the adaptive bed — same length, tempo and key, started
 *    together and mixed by gain alone (see `musicVariation.ts`). These are the
 *    only entries the stem layer ever loads.
 *  - everything else is a one-shot sting or a standalone screen loop, played
 *    through the single-active path.
 *
 * The legacy `game/{player,enemy,ally,thinking,inactive}` mood tracks are gone:
 * they were finished mixes of differing lengths, so looping them together could
 * never stay phase-locked, and only one was ever audible at a time. `game/intro`
 * survives as a sting, which is what its 6-second one-shot always was.
 */
export const musicManifest: Record<string, string> = {
	// Adaptive bed — cumulative intensity stack, sparsest first.
	'layers/bed': `${ROOT}/music/layers/bed`,
	'layers/pulse': `${ROOT}/music/layers/pulse`,
	'layers/bass': `${ROOT}/music/layers/bass`,
	'layers/melody': `${ROOT}/music/layers/melody`,
	// Adaptive bed — independent color layers.
	'layers/accent': `${ROOT}/music/layers/accent`,
	'layers/texture': `${ROOT}/music/layers/texture`,
	// One-shot stings.
	'game/intro': `${ROOT}/music/game/intro`,
	'game/win': `${ROOT}/music/game/win`,
	'game/lose': `${ROOT}/music/game/lose`,
	// Standalone screen loops.
	'intro-theme': `${ROOT}/music/intro theme`,
}

/** Fire-and-forget effects (pooled `sfx` channel). */
export const sfxManifest: Record<string, string> = {
	explosion: `${ROOT}/sfx/explosion`,
	build: `${ROOT}/sfx/build`,
	empty: `${ROOT}/sfx/empty`,
	'attack/light': `${ROOT}/sfx/attack/light gun`,
	'attack/machine': `${ROOT}/sfx/attack/machine gun`,
	'attack/big': `${ROOT}/sfx/attack/big gun`,
	'attack/distance': `${ROOT}/sfx/attack/distance`,
	'movement/foot': `${ROOT}/sfx/movement/footstep`,
	'movement/jet': `${ROOT}/sfx/movement/jet`,
	'movement/helicopter': `${ROOT}/sfx/movement/helicopter`,
	'movement/car': `${ROOT}/sfx/movement/car move`,
	'movement/car-start': `${ROOT}/sfx/movement/car start`,
	'movement/train': `${ROOT}/sfx/movement/train`,
	'movement/horse': `${ROOT}/sfx/movement/horse`,
	'movement/boat': `${ROOT}/sfx/movement/boat`,
	'movement/air': `${ROOT}/sfx/movement/air`,
}

/** Weather loops (single-active `env` channel). */
export const envManifest: Record<string, string> = {
	'weather/rain': `${ROOT}/envior/weather/rain`,
	'weather/snow': `${ROOT}/envior/weather/snow`,
	'weather/desert': `${ROOT}/envior/weather/desert`,
	'weather/sunny': `${ROOT}/envior/weather/sunny`,
}

const MANIFESTS: Record<AudioChannel, Record<string, string>> = {
	music: musicManifest,
	sfx: sfxManifest,
	env: envManifest,
}

/** Resolve a logical name on a channel to its extension-less base path. */
export function lookupAudio(channel: AudioChannel, name: string): string | undefined {
	return MANIFESTS[channel][name]
}

/** Append the chosen format and URL-encode (filenames may contain spaces). */
export function resolveAudioPath(basePath: string, format: AudioFormat): string {
	return encodeURI(`${basePath}.${format}`)
}

/** MIME types used for `canPlayType` format negotiation. */
export const AUDIO_MIME: Record<AudioFormat, string> = {
	ogg: 'audio/ogg',
	mp3: 'audio/mpeg',
}
