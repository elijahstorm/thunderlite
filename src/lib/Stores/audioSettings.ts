import { writable } from 'svelte/store'
import { browser } from '$app/environment'

/**
 * Persisted audio settings: per-channel volume + mute plus a master pair.
 *
 * Only the volume/mute flags persist — the "active track per channel" lives in
 * the engine's runtime state and is intentionally not saved. Parsing/clamping
 * is pure so it can be unit-tested without a real `localStorage`.
 */

export interface ChannelSettings {
	/** 0..1 */
	volume: number
	muted: boolean
}

export interface AudioSettings {
	master: ChannelSettings
	music: ChannelSettings
	sfx: ChannelSettings
	env: ChannelSettings
}

export const AUDIO_STORAGE_KEY = 'thunderlite.audio.settings.v1'

/** One year — settings should outlive a browsing session, like any preference. */
const AUDIO_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function defaultAudioSettings(): AudioSettings {
	return {
		master: { volume: 1, muted: false },
		music: { volume: 0.6, muted: false },
		sfx: { volume: 1, muted: false },
		env: { volume: 0.5, muted: false },
	}
}

function clamp01(value: unknown): number {
	const n = typeof value === 'number' ? value : Number(value)
	if (!Number.isFinite(n)) return 0
	return Math.min(1, Math.max(0, n))
}

function coerceChannel(raw: unknown, fallback: ChannelSettings): ChannelSettings {
	if (!raw || typeof raw !== 'object') return { ...fallback }
	const r = raw as Record<string, unknown>
	return {
		volume: 'volume' in r ? clamp01(r.volume) : fallback.volume,
		muted: typeof r.muted === 'boolean' ? r.muted : fallback.muted,
	}
}

/** Validate + clamp arbitrary parsed JSON into a complete `AudioSettings`. */
export function normalizeAudioSettings(raw: unknown): AudioSettings {
	const base = defaultAudioSettings()
	if (!raw || typeof raw !== 'object') return base
	const r = raw as Record<string, unknown>
	return {
		master: coerceChannel(r.master, base.master),
		music: coerceChannel(r.music, base.music),
		sfx: coerceChannel(r.sfx, base.sfx),
		env: coerceChannel(r.env, base.env),
	}
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

/**
 * Cookie-backed storage so the chosen preferences (notably "sound off") travel
 * with the document rather than living only in `localStorage`. A non-httpOnly
 * cookie is intentional here — these are pure client UX preferences the page
 * reads on load to decide whether audio may start, so it must be reachable from
 * JS. Auth tokens stay httpOnly elsewhere; nothing sensitive lives here.
 */
function cookieStorage(): StorageLike | null {
	if (!browser || typeof document === 'undefined') return null
	return {
		getItem(key: string): string | null {
			const prefix = `${encodeURIComponent(key)}=`
			for (const part of document.cookie ? document.cookie.split('; ') : []) {
				if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length))
			}
			return null
		},
		setItem(key: string, value: string): void {
			const secure =
				typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
			document.cookie =
				`${encodeURIComponent(key)}=${encodeURIComponent(value)}` +
				`; Path=/; Max-Age=${AUDIO_COOKIE_MAX_AGE}; SameSite=Lax${secure}`
		},
	}
}

function defaultStorage(): StorageLike | null {
	if (!browser) return null
	try {
		return cookieStorage()
	} catch {
		return null
	}
}

/** Read settings from storage (defaults when absent, corrupt, or SSR). */
export function loadAudioSettings(storage: StorageLike | null = defaultStorage()): AudioSettings {
	if (!storage) return defaultAudioSettings()
	try {
		const raw = storage.getItem(AUDIO_STORAGE_KEY)
		if (!raw) return defaultAudioSettings()
		return normalizeAudioSettings(JSON.parse(raw))
	} catch {
		return defaultAudioSettings()
	}
}

/** Persist settings; no-op when storage is unavailable (SSR). */
export function saveAudioSettings(
	settings: AudioSettings,
	storage: StorageLike | null = defaultStorage()
): void {
	if (!storage) return
	try {
		storage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(settings))
	} catch {
		/* quota / privacy mode — non-fatal */
	}
}

/** Reactive settings store, hydrated from storage and auto-persisted. */
export const audioSettings = writable<AudioSettings>(loadAudioSettings())

if (browser) {
	audioSettings.subscribe((settings) => saveAudioSettings(settings))
}
