import { get } from 'svelte/store'
import { unitData } from '$lib/GameData/unit'
import { terrainData } from '$lib/GameData/terrain'
import { canPlaceUnit } from '$lib/Engine/Interactor/Pathing/movement'
import { gameState, markTileActed, type Player, type PlayerControls } from './gameState'
import { beginBuildFade } from './buildFade'

export type BuildableUnit = {
	type: number
	data: (typeof unitData)[number]
	/** Effective price from this funding source (control discount applied for main-money builds). */
	cost: number
	affordable: boolean
	controlled: boolean
	/** Whether there's a legal tile to deploy this unit onto right now. */
	hasSpace: boolean
	buildable: boolean
}

export type SpawnResult =
	| { ok: true; tile: number }
	| { ok: false; reason: 'no-space' | 'not-affordable' | 'not-buildable' | 'invalid' }

/**
 * A unit whose loss ends the game (Death.Insta_Lose) is a unique command unit:
 * the player starts with exactly one and can never manufacture another. It's
 * excluded from every production menu — the Warfactory and the Warmachine's own
 * builder alike — and from both spawn guards, so no funding source can churn one
 * out. (Units are otherwise buildable purely by having a positive cost.)
 */
export const isProducibleUnit = (
	data: Pick<(typeof unitData)[number], 'modifiers'>
): boolean => !data.modifiers.includes('Death.Insta_Lose')

export const playerCanBuildType = (
	player: Pick<Player, 'controls'>,
	unitType: 'ground' | 'air' | 'sea'
): boolean => {
	const controls: PlayerControls = player.controls ?? { ground: 0, air: 0, sea: 0 }
	return controls[unitType] > 0
}

export const CONTROL_DISCOUNT_PER_EXTRA = 0.1
export const CONTROL_DISCOUNT_CAP = 0.5

/**
 * What a unit costs this player out of the shared money pool. The first
 * control building of a category only unlocks the type; each one beyond it
 * knocks 10% off that category's units, capped at 50%. Applies ONLY to
 * main-money sources (a Warfactory) — a Warmachine spends its private wallet
 * and always pays the sticker price. Prices stay on the 5-credit grid.
 */
export const discountedUnitCost = (
	player: Pick<Player, 'controls'>,
	data: Pick<(typeof unitData)[number], 'cost' | 'type'>
): number => {
	const owned = player.controls?.[data.type] ?? 0
	const discount = Math.min(Math.max(0, owned - 1) * CONTROL_DISCOUNT_PER_EXTRA, CONTROL_DISCOUNT_CAP)
	if (discount <= 0) return data.cost
	return Math.max(5, Math.round((data.cost * (1 - discount)) / 5) * 5)
}

/**
 * `budget` overrides the funds affordability is measured against — used for the
 * Warmachine builder menu, which spends the unit's private wallet instead of the
 * player pool. `ignoreControls` lifts the factory-ownership gate, since a
 * Warmachine is a self-contained factory that can build any unit type.
 */
export type BuildableUnitsOptions = {
	budget?: number
	ignoreControls?: boolean
	/**
	 * Predicate telling whether a given unit type has a legal tile to deploy onto.
	 * The factory menu passes the factory-tile check; the Warmachine menu passes
	 * the adjacent-tile check. When omitted (e.g. the CPU planner, which matches a
	 * capable producer to the type separately) every type is treated as placeable.
	 */
	hasSpaceFor?: (unitType: number) => boolean
}

/**
 * Whether a fresh unit of `unitType` can roll out of the factory on `buildingTile`.
 * A factory deploys onto its OWN tile, so a ship only launches from a coastal
 * factory (a Shore is Amphibious — a ship can sit on it) and a factory whose tile
 * is already occupied can't build at all. This is both the menu's grey-out gate
 * and the spawn guard, so the two can never disagree.
 */
export const canDeployFromFactory = (
	map: MapObject | MapProcesser,
	buildingTile: number,
	unitType: number
): boolean => {
	const data = unitData[unitType]
	if (!data) return false
	if (map.layers.units[buildingTile] != null) return false
	const ground = map.layers.ground[buildingTile]
	if (!ground) return false
	// A ship launches from the factory's own tile, so the factory has to sit at the
	// water's edge (a Shore is Amphibious and ocean-side) — a landlocked factory
	// can't build one. We gate on terrain *type* rather than the full move-cost
	// check because a Shore is Shallow, which a deep-draft warship can't traverse;
	// it can still dock there to launch, then steam off into open water next turn.
	if (data.type === 'sea') {
		const terrain = terrainData[ground.type]
		return !!terrain && (terrain.ocean || terrain.modifiers.includes('Amphibious'))
	}
	return canPlaceUnit(ground, { type: unitType } as UnitObject, map.layers.sky[buildingTile])
}

export const buildableUnits = (
	player: Pick<Player, 'money' | 'controls'>,
	opts: BuildableUnitsOptions = {}
): BuildableUnit[] => {
	const funds = opts.budget ?? player.money
	const out: BuildableUnit[] = []
	for (let type = 0; type < unitData.length; type++) {
		const data = unitData[type]
		if (data.cost <= 0) continue
		if (!isProducibleUnit(data)) continue
		const controlled = opts.ignoreControls ? true : playerCanBuildType(player, data.type)
		// The Warmachine (ignoreControls) spends its own wallet, not main money,
		// so the control discount never applies to it.
		const cost = opts.ignoreControls ? data.cost : discountedUnitCost(player, data)
		const affordable = funds >= cost
		const hasSpace = opts.hasSpaceFor ? opts.hasSpaceFor(type) : true
		out.push({
			type,
			data,
			cost,
			controlled,
			affordable,
			hasSpace,
			buildable: controlled && affordable && hasSpace,
		})
	}
	return out
}

export const spawnBuiltUnit = (
	map: MapObject | MapProcesser,
	buildingTile: number,
	unitType: number,
	team: number
): SpawnResult => {
	const data = unitData[unitType]
	if (!data) return { ok: false, reason: 'invalid' }

	const state = get(gameState)
	const player = state.players.find((p) => p.team === team)
	if (!player) return { ok: false, reason: 'invalid' }
	if (data.cost <= 0) return { ok: false, reason: 'not-buildable' }
	if (!isProducibleUnit(data)) return { ok: false, reason: 'not-buildable' }
	if (!playerCanBuildType(player, data.type)) return { ok: false, reason: 'not-buildable' }
	const cost = discountedUnitCost(player, data)
	if (player.money < cost) return { ok: false, reason: 'not-affordable' }

	// The unit rolls out onto the factory's own tile — never a neighbour. That's
	// what gates a ship to a coastal (Shore) factory, since a ship can only stand
	// on the Amphibious shore and never on open water beside a landlocked factory,
	// and it's what consumes the factory for the turn: the build marks the factory
	// tile acted, so it can't quietly keep churning units onto the sea next to it.
	if (!canDeployFromFactory(map, buildingTile, unitType)) {
		return { ok: false, reason: 'no-space' }
	}

	map.layers.units[buildingTile] = {
		type: unitType,
		state: 0,
		team,
		health: data.health,
	}
	// Quick fade-in so the fresh unit eases onto the board instead of popping.
	beginBuildFade(buildingTile)

	gameState.update((s) => ({
		...s,
		players: s.players.map((p) => (p.team === team ? { ...p, money: p.money - cost } : p)),
	}))

	markTileActed(buildingTile)

	return { ok: true, tile: buildingTile }
}
