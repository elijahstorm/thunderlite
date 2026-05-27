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

/** Mood-aware looping music tracks (single-active `music` channel). */
export const musicManifest: Record<string, string> = {
	'game/intro': `${ROOT}/music/game/intro`,
	'game/player': `${ROOT}/music/game/player`,
	'game/enemy': `${ROOT}/music/game/enemy`,
	'game/ally': `${ROOT}/music/game/ally`,
	'game/thinking': `${ROOT}/music/game/thinking`,
	'game/inactive': `${ROOT}/music/game/inactive`,
	'game/win': `${ROOT}/music/game/win`,
	'game/lose': `${ROOT}/music/game/lose`,
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
