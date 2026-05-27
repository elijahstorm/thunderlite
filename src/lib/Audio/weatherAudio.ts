import { audioEngine, type PlaySingleOptions } from '$lib/Audio/audioEngine'

/**
 * Environmental weather audio — loops the matching ambience on the single-active
 * `env` channel while a weather is active, and stops it on clear. The `env`
 * channel is ducked below its normal level so the loop sits *under* the music
 * rather than competing with it.
 *
 * Decoupled and headless-testable: all playback is injectable. The default
 * wiring drives the shared `audioEngine`. The weather → track mapping is a pure
 * function so it can be exercised in isolation.
 */

/** Weather ambiences available in the bank (`envManifest` `weather/*` keys). */
export type WeatherId = 'rain' | 'snow' | 'desert' | 'sunny'

const ENV_TRACK: Record<WeatherId, string> = {
	rain: 'weather/rain',
	snow: 'weather/snow',
	desert: 'weather/desert',
	sunny: 'weather/sunny',
}

/** Pure mapping: weather → env track id, or `null` when no weather is active. */
export function envForWeather(weather: WeatherId | null | undefined): string | null {
	return weather ? ENV_TRACK[weather] : null
}

/** Default ducked `env` gain so weather ambience sits under the music bed. */
export const WEATHER_DUCK = 0.4

export interface WeatherAudioOptions {
	/** Start a looping env track. Defaults to the shared audio engine. */
	playEnv?: (track: string, opts?: PlaySingleOptions) => void
	/** Stop the env loop. Defaults to the shared audio engine. */
	stopEnv?: () => void
	/** Set the env channel volume (used to duck). Defaults to the audio engine. */
	setEnvVolume?: (volume: number) => void
	/** Ducked env gain applied while weather plays. Defaults to `WEATHER_DUCK`. */
	duckVolume?: number
}

/**
 * Drives the `env` channel from the active weather. Call `setWeather(id)` when
 * weather turns on/changes and `clear()` (or `setWeather(null)`) when it lifts.
 * Switching to the same weather is a no-op, so it never restacks the loop.
 */
export class WeatherAudio {
	private readonly playEnv: (track: string, opts?: PlaySingleOptions) => void
	private readonly stopEnv: () => void
	private readonly setEnvVolume: (volume: number) => void
	private readonly duckVolume: number

	private current: WeatherId | null = null

	constructor(opts: WeatherAudioOptions = {}) {
		this.playEnv = opts.playEnv ?? ((track, o) => audioEngine.playEnv(track, o))
		this.stopEnv = opts.stopEnv ?? (() => audioEngine.stopEnv())
		this.setEnvVolume = opts.setEnvVolume ?? ((v) => audioEngine.setChannelVolume('env', v))
		this.duckVolume = opts.duckVolume ?? WEATHER_DUCK
	}

	/** The weather currently sounding, or `null`. */
	getActive(): WeatherId | null {
		return this.current
	}

	/** Activate / switch / clear weather ambience. */
	setWeather(weather: WeatherId | null): void {
		if (weather === this.current) return
		this.current = weather

		const track = envForWeather(weather)
		if (track === null) {
			this.stopEnv()
			return
		}
		// Duck the env channel so the loop stays beneath the music.
		this.setEnvVolume(this.duckVolume)
		this.playEnv(track, { loop: true })
	}

	/** Stop any active weather ambience. */
	clear(): void {
		this.setWeather(null)
	}
}

/** Shared, app-wide weather audio controller. */
export const weatherAudio = new WeatherAudio()
