// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { unitData } from '../../src/lib/GameData/unit'
import { animationData, PAYLOAD_IMPACT_ANIMATION } from '../../src/lib/GameData/animation'

// A ranged unit's swing plays tiles away from its victim, so the payload impact on
// the struck tile is the only on-board sign of *what* got hit. Every unit that
// actually shoots from range must declare one, and only those units may — a melee
// swing already plays beside its target, and an impact there would double up.
describe('ranged unit payloads', () => {
	const shootsFromRange = (u: (typeof unitData)[number]) =>
		u.range[0] >= 2 && u.power > 0 && u.attackSprite !== null

	for (const unit of unitData) {
		if (shootsFromRange(unit)) {
			it(`${unit.name} fires from range, so it declares a payload`, () => {
				expect(unit.payload).toBeDefined()
			})
		} else {
			it(`${unit.name} does not fire from range, so it carries no payload`, () => {
				expect(unit.payload).toBeUndefined()
			})
		}
	}

	it('every payload kind resolves to a registered tile-effect sheet', () => {
		for (const [kind, index] of Object.entries(PAYLOAD_IMPACT_ANIMATION)) {
			const effect = animationData[index]
			expect(effect, kind).toBeDefined()
			expect(effect.type).toBe('tile')
			expect(effect.name.toLowerCase()).toContain(kind)
		}
	})
})
