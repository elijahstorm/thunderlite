import { get } from 'svelte/store'
import { unitData } from '$lib/GameData/unit'
import { calculateDamage, canCounterAttack } from './combat'
import { gameState, markTileActed } from './gameState'
import { runModifiers } from './modifiers'
import { revealCloakedAdjacentTo } from './modifiers/cloak'
import { applyLancePassthrough } from './modifiers/lance'
import { applyVultureKill } from './modifiers/vulture'
import { mine } from './modifiers/miner'
import { repair } from './modifiers/repair'
import { landUnload, transportLoad } from './modifiers/transport'
import { spawnBuiltUnit } from './build'
import { endTurn } from './turnLoop'
import { applyWinConditions } from './winConditions'
import { audioEngine } from '$lib/Audio/audioEngine'
import { sfxForAction, type SfxAction, type SfxUnitRef } from '$lib/Audio/sfxMap'
import type { SerializedAction } from './Interactor/serializedAction'

/**
 * Options threaded through the apply path. `applyAction` stays deterministic and
 * silent by default — sound is a side effect of *live* player actions only. The
 * reconnect/replay path (H3) re-applies the whole event log; if those fired
 * SFX a reconnecting player would hear 40 explosions at once, so SFX are gated
 * on `live` and default to off.
 */
export interface ApplyActionOptions {
	/** Fire SFX for this action. Off for replay / headless. Default `false`. */
	live?: boolean
	/** Injectable sfx sink (testing). Defaults to the shared audio engine. */
	playSfx?: (id: string) => void
}

/** Emits the resolved sfx for an action, or does nothing for replay/headless. */
type SfxEmit = (action: SfxAction, unit?: SfxUnitRef | null) => void

const NO_SFX: SfxEmit = () => {}

const makeSfxEmit = (opts: ApplyActionOptions): SfxEmit => {
	if (!opts.live) return NO_SFX
	const sink = opts.playSfx ?? ((id: string) => audioEngine.playSfx(id))
	return (action, unit) => {
		const id = sfxForAction(action, unit)
		if (id) sink(id)
	}
}

const reduceHealth = (
	map: MapObject | MapProcesser,
	attacker: UnitObject,
	target: UnitObject,
	tile: number,
	role: 'attack' | 'counter',
	fx: SfxEmit
): boolean => {
	const damage = calculateDamage(attacker, target, {
		map: map as MapObject,
		defenderTile: tile,
		role,
	})
	const max = unitData[target.type]?.health ?? 0
	const current = target.health ?? max
	const next = Math.max(0, current - damage)
	target.health = next
	if (next === 0) {
		map.layers.units[tile] = null
		fx('death', target)
		runModifiers(target, 'Death', {
			kind: 'unit',
			tile,
			state: get(gameState),
			map,
		})
		return true
	}
	return false
}

const applyMove = (map: MapObject | MapProcesser, from: number, to: number, fx: SfxEmit): void => {
	const unit = map.layers.units[from]
	if (!unit) return
	if (from === to) return
	map.layers.units[from] = null
	map.layers.units[to] = unit
	fx('move', unit)
	runModifiers(unit, 'Move', {
		kind: 'unit',
		tile: to,
		state: get(gameState),
		map,
	})
	revealCloakedAdjacentTo(map as MapObject, to, unit.team)
	markTileActed(to)
}

const applyAttack = (map: MapObject | MapProcesser, from: number, to: number, fx: SfxEmit): void => {
	const attacker = map.layers.units[from]
	const target = map.layers.units[to]
	if (!attacker || !target) return

	fx('attack', attacker)
	const targetDied = reduceHealth(map, attacker, target, to, 'attack', fx)
	applyLancePassthrough(map as MapObject, from, to)

	let attackerDied = false
	if (
		!targetDied &&
		canCounterAttack(attacker, target, {
			map: map as MapObject,
			attackerTile: from,
			defenderTile: to,
		})
	) {
		// The defender returns fire — sound its own weapon before resolving the hit.
		fx('attack', target)
		attackerDied = reduceHealth(map, target, attacker, from, 'counter', fx)
	}

	markTileActed(from)
	if (targetDied && !attackerDied) applyVultureKill(attacker, from)
	applyWinConditions(map as MapObject)
}

export const applyAction = (
	map: MapObject | MapProcesser,
	action: SerializedAction,
	opts: ApplyActionOptions = {}
): void => {
	const fx = makeSfxEmit(opts)
	switch (action.kind) {
		case 'move': {
			applyMove(map, action.from, action.to, fx)
			return
		}
		case 'attack': {
			applyAttack(map, action.from, action.to, fx)
			return
		}
		case 'capture': {
			const unit = map.layers.units[action.tile]
			if (!unit) return
			runModifiers(unit, 'Start_Turn', {
				kind: 'unit',
				tile: action.tile,
				state: get(gameState),
				map,
			})
			markTileActed(action.tile)
			applyWinConditions(map as MapObject)
			return
		}
		case 'mine': {
			const unit = map.layers.units[action.tile]
			if (!unit) return
			mine(map, action.tile, unit.team)
			applyWinConditions(map as MapObject)
			return
		}
		case 'repair': {
			const unit = map.layers.units[action.tile]
			if (!unit) return
			repair(map, action.tile, unit.team)
			applyWinConditions(map as MapObject)
			return
		}
		case 'build': {
			const building = map.layers.buildings[action.building]
			if (!building) return
			spawnBuiltUnit(map, action.building, action.unitType, building.team)
			fx('build')
			applyWinConditions(map as MapObject)
			return
		}
		case 'transport-load': {
			const result = transportLoad(map, action.passenger, action.transport)
			if (result.ok) {
				markTileActed(action.transport)
				applyWinConditions(map as MapObject)
			}
			return
		}
		case 'transport-unload': {
			const result = landUnload(map, action.transport, action.tile)
			if (result.ok) {
				markTileActed(action.tile)
				applyWinConditions(map as MapObject)
			}
			return
		}
		case 'wait': {
			markTileActed(action.tile)
			applyWinConditions(map as MapObject)
			return
		}
		case 'end-turn': {
			endTurn({ map })
			return
		}
	}
}
