// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import {
	MUSIC_PACKS,
	PLAYABLE_PACKS,
	packLayers,
	phraseSecondsFor,
	packById,
	packForMatch,
	type MusicPack,
} from '../../src/lib/Audio/musicPacks'
import { musicManifest, AUDIO_FORMATS } from '../../src/lib/Audio/assetManifest'

const STATIC_ROOT = resolve(__dirname, '../../static')

/** Absolute path to a layer's file in one format. */
const layerPath = (id: string, format: string) =>
	resolve(STATIC_ROOT, `${musicManifest[id]!.replace(/^\//, '')}.${format}`)

const hasFfprobe = (() => {
	try {
		execFileSync('ffprobe', ['-version'], { stdio: 'ignore' })
		return true
	} catch {
		return false
	}
})()

const durationOf = (file: string): number =>
	Number(
		execFileSync(
			'ffprobe',
			['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
			{ encoding: 'utf8' }
		).trim()
	)

/** Packs whose audio is actually on disk. The demo pack is generated, so it may not be. */
const presentPacks = MUSIC_PACKS.filter((p) =>
	packLayers(p).every((id) => AUDIO_FORMATS.every((f) => existsSync(layerPath(id, f))))
)

describe('pack registry', () => {
	it('registers at least one playable pack', () => {
		expect(PLAYABLE_PACKS.length).toBeGreaterThan(0)
	})

	it('uses unique ids', () => {
		const ids = MUSIC_PACKS.map((p) => p.id)
		expect(new Set(ids).size).toBe(ids.length)
	})

	it('keeps the demo scaffolding out of the match rotation', () => {
		expect(PLAYABLE_PACKS.some((p) => p.id === 'demo')).toBe(false)
		expect(packById('demo')?.devOnly).toBe(true)
	})

	it('never lists the foundation among the extras', () => {
		// It would be raised twice, at double gain.
		for (const p of MUSIC_PACKS) expect(p.extras, p.id).not.toContain(p.foundation)
	})

	it('gives every pack a foundation and at least one extra', () => {
		for (const p of MUSIC_PACKS) {
			expect(p.foundation, p.id).toBeTruthy()
			expect(p.extras.length, p.id).toBeGreaterThan(0)
		}
	})

	it('resolves every declared layer through the audio manifest', () => {
		// A pack naming a layer the manifest cannot resolve would warn and silently
		// drop that layer at runtime.
		for (const p of MUSIC_PACKS) {
			for (const id of packLayers(p)) expect(musicManifest[id], `${p.id}: ${id}`).toBeTruthy()
		}
	})

	it('subdivides every loop into phrases of a usable length', () => {
		// Long enough that re-arrangements do not feel twitchy, short enough that a
		// turn does not pass without one.
		for (const p of MUSIC_PACKS) {
			const phrase = phraseSecondsFor(p)
			expect(phrase, p.id).toBeGreaterThan(6)
			expect(phrase, p.id).toBeLessThan(24)
			expect(p.loopSeconds / phrase, p.id).toBeCloseTo(p.phrasesPerLoop, 6)
		}
	})
})

describe('packForMatch', () => {
	it('is deterministic in the seed', () => {
		for (const seed of [0, 1, 7, 1234, 99999]) {
			expect(packForMatch(seed).id).toBe(packForMatch(seed).id)
		}
	})

	it('only ever returns a playable pack', () => {
		for (let seed = 0; seed < 50; seed++) {
			expect(PLAYABLE_PACKS.map((p) => p.id)).toContain(packForMatch(seed).id)
		}
	})

	it('spreads across the whole catalogue', () => {
		// Otherwise two of the three packs would never be heard.
		const seen = new Set<string>()
		for (let seed = 0; seed < PLAYABLE_PACKS.length * 4; seed++) seen.add(packForMatch(seed).id)
		expect(seen.size).toBe(PLAYABLE_PACKS.length)
	})

	it('handles a negative seed without throwing', () => {
		expect(() => packForMatch(-7)).not.toThrow()
		expect(PLAYABLE_PACKS.map((p) => p.id)).toContain(packForMatch(-7).id)
	})
})

describe('pack audio on disk', () => {
	it('ships every playable pack in every supported format', () => {
		for (const p of PLAYABLE_PACKS) {
			for (const id of packLayers(p)) {
				for (const format of AUDIO_FORMATS) {
					const file = layerPath(id, format)
					expect(existsSync(file), `missing ${file}`).toBe(true)
				}
			}
		}
	})

	it('found audio for the packs it is about to measure', () => {
		expect(presentPacks.length).toBeGreaterThan(0)
	})

	it.skipIf(!hasFfprobe)('matches every format of a layer to the same audio', () => {
		// The original bank shipped `inactive.mp3` at 354s and `inactive.ogg` at
		// 198s, so players heard different music depending on which codec their
		// browser picked. Format is negotiated at runtime, so parity is not optional.
		for (const p of presentPacks) {
			for (const id of packLayers(p)) {
				const durations = AUDIO_FORMATS.map((f) => durationOf(layerPath(id, f)))
				const spread = Math.max(...durations) - Math.min(...durations)
				expect(spread, `${id} differs by ${spread.toFixed(3)}s across formats`).toBeLessThan(0.2)
			}
		}
	})

	it.skipIf(!hasFfprobe)('keeps every layer of a pack exactly the same length', () => {
		// Layers are started together and never restarted, so unequal lengths would
		// drift out of phase on the first wrap and the crossfades would stop being
		// musical — the defect the old mood tracks had.
		for (const p of presentPacks) {
			const durations = packLayers(p).map((id) => durationOf(layerPath(id, 'ogg')))
			const spread = Math.max(...durations) - Math.min(...durations)
			expect(spread, `${p.id} layers differ by ${spread.toFixed(3)}s`).toBeLessThan(0.05)
		}
	})

	it.skipIf(!hasFfprobe)('declares a loopSeconds that matches the audio', () => {
		// phraseSeconds is derived from loopSeconds, so a wrong value here puts
		// every re-arrangement off the grid.
		for (const p of presentPacks) {
			const actual = durationOf(layerPath(p.foundation, 'ogg'))
			expect(
				Math.abs(actual - p.loopSeconds),
				`${p.id}: declared ${p.loopSeconds}s, file ${actual}s`
			).toBeLessThan(0.1)
		}
	})
})

describe('packLayers', () => {
	it('lists the foundation first, then the extras, with no duplicates', () => {
		const pack: MusicPack = {
			id: 'x',
			loopSeconds: 60,
			phrasesPerLoop: 4,
			foundation: 'a',
			extras: ['b', 'c'],
		}
		expect(packLayers(pack)).toEqual(['a', 'b', 'c'])
	})
})
