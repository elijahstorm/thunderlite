// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { deriveFromHash, mapHasher } from '../../../src/lib/Map/Editor/mapExporter'

/** Round-trip a map through hash → derive and return the rebuilt map. */
const roundTrip = (map: MapObject): MapObject => deriveFromHash(mapHasher(map))

describe('mapExporter — map-level settings round-trip', () => {
	it('preserves an authored script, fog flag, and starting funds through hash/derive', () => {
		const base = deriveFromHash()
		base.script = '<start>\nmove: 2,2\ntalk Cmdr: "Go!"\n</start>'
		base.fog = false
		base.funds = 1500

		const rebuilt = roundTrip(base)

		expect(rebuilt.script).toBe(base.script)
		expect(rebuilt.fog).toBe(false)
		expect(rebuilt.funds).toBe(1500)
	})

	it('omits unset settings rather than serializing undefined', () => {
		const base = deriveFromHash()

		const rebuilt = roundTrip(base)

		expect(rebuilt.script).toBeUndefined()
		expect(rebuilt.fog).toBeUndefined()
		expect(rebuilt.funds).toBeUndefined()
	})

	it('keeps fog === true distinct from unset (so an explicit on survives)', () => {
		const base = deriveFromHash()
		base.fog = true

		expect(roundTrip(base).fog).toBe(true)
	})
})
