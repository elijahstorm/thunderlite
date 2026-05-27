// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { sfxForAction } from '../../src/lib/Audio/sfxMap'
import {
	WeatherAudio,
	envForWeather,
	WEATHER_DUCK,
	type WeatherId,
} from '../../src/lib/Audio/weatherAudio'
import { unitData } from '../../src/lib/GameData/unit'

const typeOf = (name: string): number => {
	const idx = unitData.findIndex((u) => u.name === name)
	if (idx < 0) throw new Error(`unknown unit: ${name}`)
	return idx
}

// ── sfxForAction (pure) ───────────────────────────────────────────────────────

describe('sfxForAction — movement branch', () => {
	it('a foot unit (Strike Commando) plays footstep', () => {
		expect(sfxForAction('move', { type: typeOf('Strike Commando') })).toBe('movement/foot')
	})

	it('a tank (Scorpion Tank) plays car move', () => {
		expect(sfxForAction('move', { type: typeOf('Scorpion Tank') })).toBe('movement/car')
	})

	it('a jet (Raptor Fighter, high air) plays jet', () => {
		expect(sfxForAction('move', { type: typeOf('Raptor Fighter') })).toBe('movement/jet')
	})

	it('a low-air unit (Vulture Drone) plays helicopter', () => {
		expect(sfxForAction('move', { type: typeOf('Vulture Drone') })).toBe('movement/helicopter')
	})

	it('a boat (Intrepid) plays boat', () => {
		expect(sfxForAction('move', { type: typeOf('Intrepid') })).toBe('movement/boat')
	})

	it('an immobile unit (Turret) has no movement sfx', () => {
		expect(sfxForAction('move', { type: typeOf('Turret') })).toBeNull()
	})

	it('an unknown / missing unit has no movement sfx', () => {
		expect(sfxForAction('move', { type: 9999 })).toBeNull()
		expect(sfxForAction('move', null)).toBeNull()
	})
})

describe('sfxForAction — attack branch', () => {
	it('a light weapon (Strike Commando) plays the light gun', () => {
		expect(sfxForAction('attack', { type: typeOf('Strike Commando') })).toBe('attack/light')
	})

	it('a medium weapon (Scorpion Tank) plays the machine gun', () => {
		expect(sfxForAction('attack', { type: typeOf('Scorpion Tank') })).toBe('attack/machine')
	})

	it('a heavy weapon (Annihilator Tank) plays the big gun', () => {
		expect(sfxForAction('attack', { type: typeOf('Annihilator Tank') })).toBe('attack/big')
	})

	it('an indirect-fire unit (Rocket Truck) plays the distance report', () => {
		// Rocket Truck range [3,5] — cannot hit adjacent, so it "reports" at distance.
		expect(sfxForAction('attack', { type: typeOf('Rocket Truck') })).toBe('attack/distance')
	})

	it('an unknown / missing attacker has no weapon sfx', () => {
		expect(sfxForAction('attack', { type: 9999 })).toBeNull()
		expect(sfxForAction('attack', null)).toBeNull()
	})
})

describe('sfxForAction — build & death branches', () => {
	it('a build plays the build chime regardless of unit', () => {
		expect(sfxForAction('build')).toBe('build')
		expect(sfxForAction('build', { type: typeOf('Scorpion Tank') })).toBe('build')
	})

	it('a death plays the explosion regardless of unit', () => {
		expect(sfxForAction('death')).toBe('explosion')
		expect(sfxForAction('death', { type: typeOf('Raptor Fighter') })).toBe('explosion')
	})
})

// ── weatherAudio ──────────────────────────────────────────────────────────────

describe('envForWeather (pure)', () => {
	it('maps each weather to its env track', () => {
		expect(envForWeather('rain')).toBe('weather/rain')
		expect(envForWeather('snow')).toBe('weather/snow')
		expect(envForWeather('desert')).toBe('weather/desert')
		expect(envForWeather('sunny')).toBe('weather/sunny')
	})

	it('maps no weather to null', () => {
		expect(envForWeather(null)).toBeNull()
		expect(envForWeather(undefined)).toBeNull()
	})
})

type EnvPlay = { track: string; loop: boolean }

const recorder = () => {
	const plays: EnvPlay[] = []
	const volumes: number[] = []
	let stopped = 0
	return {
		plays,
		volumes,
		stopCount: () => stopped,
		playEnv: (track: string, opts?: { loop?: boolean }) =>
			plays.push({ track, loop: opts?.loop ?? true }),
		stopEnv: () => {
			stopped++
		},
		setEnvVolume: (v: number) => volumes.push(v),
	}
}

describe('WeatherAudio (controller)', () => {
	it('loops the matching env track and ducks the env channel on activation', () => {
		const rec = recorder()
		const wa = new WeatherAudio(rec)

		wa.setWeather('rain')

		expect(rec.plays).toEqual([{ track: 'weather/rain', loop: true }])
		expect(rec.volumes).toEqual([WEATHER_DUCK])
		expect(wa.getActive()).toBe('rain')
	})

	it('stops the loop on clear', () => {
		const rec = recorder()
		const wa = new WeatherAudio(rec)

		wa.setWeather('rain')
		wa.clear()

		expect(rec.stopCount()).toBe(1)
		expect(wa.getActive()).toBeNull()
	})

	it('does not restack the loop when the same weather is set again', () => {
		const rec = recorder()
		const wa = new WeatherAudio(rec)

		wa.setWeather('rain')
		wa.setWeather('rain')

		expect(rec.plays).toHaveLength(1)
	})

	it('switches tracks when the weather changes', () => {
		const rec = recorder()
		const wa = new WeatherAudio(rec)

		wa.setWeather('rain')
		wa.setWeather('snow')

		expect(rec.plays.map((p) => p.track)).toEqual(['weather/rain', 'weather/snow'])
	})

	it('respects a custom duck volume', () => {
		const rec = recorder()
		const wa = new WeatherAudio({ ...rec, duckVolume: 0.25 })

		wa.setWeather('desert')

		expect(rec.volumes).toEqual([0.25])
	})
})

// type-only assertion to keep WeatherId referenced
const _id: WeatherId = 'rain'
void _id
