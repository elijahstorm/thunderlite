// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import { get } from 'svelte/store'
import { generateAttackList } from '../../src/lib/Engine/Interactor/Pathing/attack'
import { concealedEnemyTiles, freezeSight } from '../../src/lib/Engine/visibility'
import {
	fogOfWarEnabled,
	frozenSight,
	heldSight,
	releaseSight,
} from '../../src/lib/Engine/fogState'
import { terrainData } from '../../src/lib/GameData/terrain'
import { unitData } from '../../src/lib/GameData/unit'

const terrainIndex = (name: string) => {
	const idx = terrainData.findIndex((t) => t.name === name)
	if (idx < 0) throw new Error(`unknown terrain: ${name}`)
	return idx
}

const unitIndex = (name: string) => {
	const idx = unitData.findIndex((u) => u.name === name)
	if (idx < 0) throw new Error(`unknown unit: ${name}`)
	return idx
}

const PLAINS = terrainIndex('Plains')
const SCORPION_TANK = unitIndex('Scorpion Tank') // direct ground bruiser

const ground = (type: number): GroundObject => ({ type, state: 0 })
const unit = (type: number, team = 0): UnitObject => ({ type, state: 0, team })

const makeMap = (cols: number, rows: number): MapObject => ({
	cols,
	rows,
	layers: {
		ground: new Array(cols * rows).fill(0).map(() => ground(PLAINS)),
		sky: new Array(cols * rows).fill(null),
		units: new Array(cols * rows).fill(null),
		buildings: new Array(cols * rows).fill(null),
	},
	filters: {
		ground: () => [],
		sky: () => [],
		units: () => [],
		buildings: () => [],
	},
	route: new Array(cols * rows).fill(undefined),
	highlights: new Array(cols * rows).fill(undefined),
})

// A 12-wide corridor: our tank starts at the far left, the enemy sits at the far
// right, well outside the tank's sight. Walking the tank right up next to the enemy
// is the "unveil and shoot in one action" case the freeze exists to stop.
const setup = () => {
	const map = makeMap(12, 1)
	const tank = unit(SCORPION_TANK, 0)
	map.layers.units[0] = tank
	map.layers.units[11] = unit(SCORPION_TANK, 1)
	return { map, tank }
}

const stepTo = (map: MapObject, mover: UnitObject, from: number, to: number) => {
	map.layers.units[from] = null
	map.layers.units[to] = mover
}

afterEach(() => {
	releaseSight()
	fogOfWarEnabled.set(false)
})

describe('freezeSight / heldSight', () => {
	it('is a no-op with fog off', () => {
		const { map } = setup()
		freezeSight(map, 0)
		expect(get(frozenSight)).toBeNull()
		expect(heldSight(0)).toBeNull()
	})

	it('holds the pre-move reach for the frozen team only', () => {
		fogOfWarEnabled.set(true)
		const { map } = setup()
		freezeSight(map, 0)
		const held = heldSight(0)
		expect(held).not.toBeNull()
		expect(held!.visible.has(0)).toBe(true)
		expect(held!.visible.has(11)).toBe(false)
		expect(heldSight(1)).toBeNull()
		releaseSight()
		expect(heldSight(0)).toBeNull()
	})
})

describe('concealedEnemyTiles under a sight freeze', () => {
	it('keeps an enemy the mover only just stepped up to concealed until released', () => {
		fogOfWarEnabled.set(true)
		const { map, tank } = setup()
		expect(concealedEnemyTiles(map, 0).has(11)).toBe(true)

		freezeSight(map, 0)
		stepTo(map, tank, 0, 10)

		// Live sight would spot the neighbour; the held pre-move sight does not.
		expect(concealedEnemyTiles(map, 0).has(11)).toBe(true)
		expect(generateAttackList(map, 10, tank)).not.toContain(11)

		// The decision lands: fog catches up and the enemy is in the open.
		releaseSight()
		expect(concealedEnemyTiles(map, 0).has(11)).toBe(false)
		expect(generateAttackList(map, 10, tank)).toContain(11)
	})

	it('still offers an enemy that was already in sight before the move', () => {
		fogOfWarEnabled.set(true)
		const { map, tank } = setup()
		// Park the enemy inside the tank's starting sight.
		map.layers.units[11] = null
		map.layers.units[2] = unit(SCORPION_TANK, 1)
		expect(concealedEnemyTiles(map, 0).has(2)).toBe(false)

		freezeSight(map, 0)
		stepTo(map, tank, 0, 1)
		expect(generateAttackList(map, 1, tank)).toContain(2)
	})

	it('does not affect the other team', () => {
		fogOfWarEnabled.set(true)
		const { map, tank } = setup()
		freezeSight(map, 0)
		stepTo(map, tank, 0, 10)
		// The enemy's own live sight now has our tank right next door.
		expect(concealedEnemyTiles(map, 1).has(10)).toBe(false)
	})
})
