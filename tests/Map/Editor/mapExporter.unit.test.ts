// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { deriveFromHash, mapHasher } from '../../../src/lib/Map/Editor/mapExporter'
import { unitData } from '../../../src/lib/GameData/unit'
import {
	TRANSPORTER_TYPE,
	LEVIATHAN_TYPE,
} from '../../../src/lib/Engine/modifiers/transport'

const STRIKE_COMMANDO = unitData.findIndex((u) => u.name === 'Strike Commando')

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

describe('mapExporter — transport cargo round-trip', () => {
	it("preserves a loaded transport's passenger (type + carrier team) through hash/derive", () => {
		const base = deriveFromHash()
		base.layers.units[5] = {
			type: TRANSPORTER_TYPE,
			team: 1,
			state: 4,
			rescuedUnit: { type: STRIKE_COMMANDO, team: 1, state: 4 },
		}

		const rebuilt = roundTrip(base)
		const transport = rebuilt.layers.units[5]
		expect(transport?.type).toBe(TRANSPORTER_TYPE)
		expect(transport?.team).toBe(1)
		expect(transport?.rescuedUnit?.type).toBe(STRIKE_COMMANDO)
		// The passenger always inherits the carrier's team.
		expect(transport?.rescuedUnit?.team).toBe(1)
	})

	it('an empty transport round-trips with no rescuedUnit', () => {
		const base = deriveFromHash()
		base.layers.units[7] = { type: LEVIATHAN_TYPE, team: 0, state: 4 }

		const transport = roundTrip(base).layers.units[7]
		expect(transport?.type).toBe(LEVIATHAN_TYPE)
		expect(transport?.rescuedUnit ?? null).toBeNull()
	})
})
