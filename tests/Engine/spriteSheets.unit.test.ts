// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { unitData } from '../../src/lib/GameData/unit'
import { animationData } from '../../src/lib/GameData/animation'
import { skyData } from '../../src/lib/GameData/sky'

// Sprite sheets must agree with the geometry the renderers assume, or frames
// sample across cell boundaries and units visually drift/jump mid-animation
// (Animator.svelte sizes the overlay background as `width * states` by
// `height * frames`, so a wrong `frames` squashes the whole sheet).
//
// Attack overlays (animateAttack): 4 state columns x `frames` rows of 150px.
// Idle sheets (paint.ts): cells are (60 + xOffset) x (60 + yOffset), one row
// per animation frame.

const STATIC = join(__dirname, '../../static')

// PNG stores the image size in the IHDR chunk: width and height as big-endian
// u32 at byte offsets 16 and 20.
const pngSize = (path: string) => {
	const buf = readFileSync(path)
	expect(buf.readUInt32BE(0)).toBe(0x89504e47) // PNG signature
	return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

describe('unit sprite sheet dimensions', () => {
	for (const unit of unitData) {
		it(`${unit.name} idle sheet matches its declared cell grid`, () => {
			const { width, height } = pngSize(join(STATIC, unit.url))
			expect(height).toBe(unit.frames * (60 + unit.yOffset))
			expect(width % (60 + unit.xOffset)).toBe(0)
		})

		if (!unit.attackSprite) continue
		const attack = unit.attackSprite
		it(`${unit.name} attack sheet matches its declared frame count`, () => {
			const { width, height } = pngSize(join(STATIC, attack.url))
			expect(width).toBe(4 * 150)
			expect(height).toBe(attack.frames * 150)
		})
	}
})

// Weather sheets: `frames` rows of (60 + yOffset). Amorphous weathers are a
// single state column; an autotiling weather (connector 1, the Jetstream) is a
// grid of all 16 rollDecision connection states as columns, so a run of tiles
// can pick a directional frame and flow as one connected highway.
describe('sky (weather) sprite sheet dimensions', () => {
	for (const sky of skyData) {
		it(`${sky.name} sheet matches its declared grid`, () => {
			const { width, height } = pngSize(join(STATIC, sky.url))
			const cell = 60 + sky.xOffset
			expect(height).toBe(sky.frames * (60 + sky.yOffset))
			expect(width % cell).toBe(0)
			expect(width / cell).toBe(sky.connector === 1 ? 16 : 1)
		})
	}
})

// Tile animations (explosion, secondary-hit effects, pointer, select) are
// single-column strips: `width` wide by `frames` rows of `height`. animateTileEffect
// sizes the overlay as width x (height * frames), so a mismatch squashes every frame.
describe('tile animation sheet dimensions', () => {
	for (const fx of animationData) {
		it(`${fx.name} effect sheet matches its declared frame grid`, () => {
			const { width, height } = pngSize(join(STATIC, fx.url))
			expect(width).toBe(fx.width)
			expect(height).toBe(fx.frames * fx.height)
		})
	}
})
