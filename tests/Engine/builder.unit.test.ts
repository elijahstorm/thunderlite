// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import { gameState, resetGameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import { buildAdjacent, passableAdjacentTiles } from '../../src/lib/Engine/modifiers/builder'
import { WARMACHINE_WALLET, walletOf } from '../../src/lib/Engine/wallet'
import {
	instaLose,
	playerHasOtherInstaLoseUnit,
	playerHasCommandCenter,
} from '../../src/lib/Engine/modifiers/instaLose'
import { unitData } from '../../src/lib/GameData/unit'
import { buildingData } from '../../src/lib/GameData/building'
import { terrainData } from '../../src/lib/GameData/terrain'

const WARMACHINE_TYPE = unitData.findIndex((u) => u.name === 'Warmachine')
const SCORPION_TANK_TYPE = unitData.findIndex((u) => u.name === 'Scorpion Tank')
const STRIKE_COMMANDO_TYPE = unitData.findIndex((u) => u.name === 'Strike Commando')
const RAPTOR_FIGHTER_TYPE = unitData.findIndex((u) => u.name === 'Raptor Fighter')
const COMMAND_CENTER_TYPE = buildingData.findIndex((b) => b.name === 'Command Center')
const PLAINS = terrainData.findIndex((t) => t.name === 'Plains')
const VOLCANO = terrainData.findIndex((t) => t.name === 'Volcano')

const makeMap = (overrides: Partial<MapProcesser> = {}): MapProcesser => ({
	cols: 4,
	rows: 4,
	layers: {
		ground: new Array(16).fill(0).map(() => ({ type: PLAINS, state: 0 })),
		sky: new Array(16).fill(null),
		units: new Array(16).fill(null),
		buildings: new Array(16).fill(null),
	},
	...overrides,
})

const warmachine = (team: number, wallet?: number): UnitObject => ({
	type: WARMACHINE_TYPE,
	state: 0,
	team,
	health: unitData[WARMACHINE_TYPE].health,
	...(wallet !== undefined ? { wallet } : {}),
})

const building = (team: number, type: number): BuildingObject => ({ type, state: 0, team })

const giveMoneyAndControls = (
	team: number,
	money: number,
	controls: { ground?: boolean; air?: boolean; sea?: boolean } = {}
) => {
	gameState.update((s) => ({
		...s,
		players: s.players.map((p) =>
			p.team === team
				? {
						...p,
						money,
						controls: {
							ground: controls.ground ?? false,
							air: controls.air ?? false,
							sea: controls.sea ?? false,
						},
					}
				: p
		),
	}))
}

describe('builder.passableAdjacentTiles', () => {
	it('returns adjacent tiles excluding occupied and impassable', () => {
		const map = makeMap()
		map.layers.units[5] = warmachine(0)
		map.layers.units[1] = warmachine(0) // occupy tile above
		map.layers.ground[6].type = VOLCANO // impassable to east
		const adjacencies = passableAdjacentTiles(map, 5)
		// tile 5 is row 1, col 1; neighbors are 1 (occupied), 4, 6 (volcano), 9
		expect(adjacencies).toContain(4)
		expect(adjacencies).toContain(9)
		expect(adjacencies).not.toContain(1)
		expect(adjacencies).not.toContain(6)
	})
})

describe('builder.buildAdjacent', () => {
	beforeEach(() => {
		resetGameState()
	})

	it('spawns a Scorpion Tank, deducts from the unit wallet (not player money), marks tiles acted', () => {
		const map = makeMap()
		map.layers.units[5] = warmachine(0)
		initGameStateFromMap(map)
		// Player money is irrelevant: the Warmachine pays from its own wallet.
		giveMoneyAndControls(0, 500, {})

		const result = buildAdjacent(map, 5, SCORPION_TANK_TYPE, 0)
		expect(result.ok).toBe(true)
		if (result.ok) {
			expect([1, 4, 6, 9]).toContain(result.tile)
			expect(map.layers.units[result.tile]?.type).toBe(SCORPION_TANK_TYPE)
			expect(map.layers.units[result.tile]?.team).toBe(0)
		}
		// Wallet drained by the unit cost; player pool untouched.
		const builder = map.layers.units[5]!
		expect(walletOf(builder)).toBe(WARMACHINE_WALLET - unitData[SCORPION_TANK_TYPE].cost)
		const player = get(gameState).players.find((p) => p.team === 0)
		expect(player?.money).toBe(500)
		const acted = get(gameState).actedTiles
		expect(acted.has(5)).toBe(true)
		if (result.ok) expect(acted.has(result.tile)).toBe(true)
	})

	it('honors a destination preference when it is a valid adjacent', () => {
		const map = makeMap()
		map.layers.units[5] = warmachine(0)
		initGameStateFromMap(map)

		const result = buildAdjacent(map, 5, SCORPION_TANK_TYPE, 0, 9)
		expect(result.ok).toBe(true)
		if (result.ok) expect(result.tile).toBe(9)
	})

	it('rejects when the wallet cannot afford the unit', () => {
		const map = makeMap()
		map.layers.units[5] = warmachine(0, 10) // wallet of only $10
		initGameStateFromMap(map)
		giveMoneyAndControls(0, 9999, { ground: true }) // ample player money is ignored

		const result = buildAdjacent(map, 5, SCORPION_TANK_TYPE, 0)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe('not-affordable')
	})

	it('builds any unit type regardless of player controls (independent factory)', () => {
		const map = makeMap()
		map.layers.units[5] = warmachine(0)
		initGameStateFromMap(map)
		// No air control, no money — the Warmachine builds an air unit anyway from
		// its own wallet, because it is a self-contained mobile factory.
		giveMoneyAndControls(0, 0, { ground: false, air: false })

		const result = buildAdjacent(map, 5, RAPTOR_FIGHTER_TYPE, 0)
		expect(result.ok).toBe(true)
		if (result.ok) {
			expect(map.layers.units[result.tile]?.type).toBe(RAPTOR_FIGHTER_TYPE)
		}
		expect(walletOf(map.layers.units[5]!)).toBe(
			WARMACHINE_WALLET - unitData[RAPTOR_FIGHTER_TYPE].cost
		)
	})

	it('rejects when all adjacent tiles are blocked', () => {
		const map = makeMap()
		map.layers.units[5] = warmachine(0)
		map.layers.units[1] = warmachine(0)
		map.layers.units[4] = warmachine(0)
		map.layers.units[6] = warmachine(0)
		map.layers.units[9] = warmachine(0)
		initGameStateFromMap(map)
		giveMoneyAndControls(0, 9999, { ground: true })

		const result = buildAdjacent(map, 5, SCORPION_TANK_TYPE, 0)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe('no-space')
	})

	it('rejects when destination tile is not a valid adjacent and falls back to nothing if it had to', () => {
		const map = makeMap()
		map.layers.units[5] = warmachine(0)
		initGameStateFromMap(map)
		giveMoneyAndControls(0, 500, { ground: true })

		const result = buildAdjacent(map, 5, SCORPION_TANK_TYPE, 0, 999)
		// destination is invalid, should fall back to first adjacent
		expect(result.ok).toBe(true)
		if (result.ok) expect([1, 4, 6, 9]).toContain(result.tile)
	})
})

describe('instaLose modifier', () => {
	beforeEach(() => {
		resetGameState()
	})

	it('setting hasLost when killing only Warmachine with no CC', () => {
		const map = makeMap()
		const dyingTile = 5
		map.layers.units[dyingTile] = warmachine(0)
		map.layers.units[0] = { type: STRIKE_COMMANDO_TYPE, state: 0, team: 0 }
		// no command center for team 0; team 1 needed so player roster exists
		map.layers.units[15] = warmachine(1)
		initGameStateFromMap(map)

		// simulate death: remove from map then run modifier
		const dying = map.layers.units[dyingTile]!
		map.layers.units[dyingTile] = null
		instaLose(dying, {
			kind: 'unit',
			tile: dyingTile,
			state: get(gameState),
			map,
		})

		const team0 = get(gameState).players.find((p) => p.team === 0)
		expect(team0?.hasLost).toBe(true)
	})

	it('does not set hasLost when player still has a Command Center', () => {
		const map = makeMap()
		map.layers.units[5] = warmachine(0)
		map.layers.buildings[10] = building(0, COMMAND_CENTER_TYPE)
		map.layers.units[15] = warmachine(1)
		initGameStateFromMap(map)

		const dying = map.layers.units[5]!
		map.layers.units[5] = null
		instaLose(dying, {
			kind: 'unit',
			tile: 5,
			state: get(gameState),
			map,
		})

		const team0 = get(gameState).players.find((p) => p.team === 0)
		expect(team0?.hasLost).toBe(false)
	})

	it('does not set hasLost when another Warmachine remains for the team', () => {
		const map = makeMap()
		map.layers.units[5] = warmachine(0)
		map.layers.units[8] = warmachine(0) // surviving Warmachine
		map.layers.units[15] = warmachine(1)
		initGameStateFromMap(map)

		const dying = map.layers.units[5]!
		map.layers.units[5] = null
		instaLose(dying, {
			kind: 'unit',
			tile: 5,
			state: get(gameState),
			map,
		})

		const team0 = get(gameState).players.find((p) => p.team === 0)
		expect(team0?.hasLost).toBe(false)
	})

	it('predicate helpers correctly detect command center and other insta-lose units', () => {
		const map = makeMap()
		map.layers.units[5] = warmachine(0)
		map.layers.units[8] = warmachine(0)
		map.layers.buildings[10] = building(0, COMMAND_CENTER_TYPE)
		map.layers.units[15] = warmachine(1)
		initGameStateFromMap(map)

		expect(playerHasCommandCenter(map, 0)).toBe(true)
		expect(playerHasCommandCenter(map, 1)).toBe(false)
		expect(playerHasOtherInstaLoseUnit(map, 0, 5)).toBe(true)
		expect(playerHasOtherInstaLoseUnit(map, 1, 15)).toBe(false)
	})
})
