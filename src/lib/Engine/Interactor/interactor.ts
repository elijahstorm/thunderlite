import { highlightActionsList, generateActionsList } from '$lib/Layers/tileHighlighter'
import { get } from 'svelte/store'
import { animateRoute, animateAttack, animateExplosion } from '../Animator/animator'
import { interactionSource, interactionState } from './interactionState'
import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { pathFinder } from './Pathing/pathFinder'
import { canSelectUnit, gameState, markTileActed } from '../gameState'
import { calculateDamage, canCounterAttack, type AttackRole } from '../combat'
import { openBuildMenu } from '../HUD/buildMenuStore'
import { runModifiers } from '../modifiers'
import { revealCloakedAdjacentTo } from '../modifiers/cloak'
import { mine } from '../modifiers/miner'
import { applyVultureKill } from '../modifiers/vulture'
import { applyLancePassthrough } from '../modifiers/lance'
import { repair } from '../modifiers/repair'
import {
	findFriendlyTransporters,
	landTiles,
	landUnload,
	shipOut,
	transportLoad,
} from '../modifiers/transport'
import { applyWinConditions } from '../winConditions'
import { computeAvailableActions, type ActionMenuItemId } from '../actions'
import {
	openActionMenu,
	closeActionMenu,
	actionMenuState,
} from '../HUD/actionMenuStore'
import { generateAttackList } from './Pathing/attack'

type Interaction = {
	map: MapObject
	tile: number
	choice?: number
	action?: keyof typeof actionsDecision
	callback?: VoidFunction
}

type Interactor = (interaction: Interaction) => void

export const interactor: Interactor = (interaction) =>
	verifyInteraction(interaction) &&
	actionsDecision[interaction.action ?? get(interactionState)](interaction)

const verifyInteraction = (obj: object) => Object.hasOwn(obj, 'tile') && Object.hasOwn(obj, 'map')

const select: Interactor = ({ map, tile }) => {
	const unit = map.layers.units[tile]
	if (!unit) {
		const building = map.layers.buildings[tile]
		if (building && buildingData[building.type]?.actable) {
			const state = get(gameState)
			if (state.phase !== 'playing') return
			if (building.team !== state.currentTeam) return
			if (state.actedTiles.has(tile)) return
			openBuildMenu(tile, building.team)
		}
		return
	}
	if (!canSelectUnit(unit, tile, get(gameState))) {
		return
	}

	highlightActionsList(map, generateActionsList(map, tile, unit))
	interactionSource.set(tile)
	interactionState.set('choice')
}

const choice: Interactor = ({ map, tile }) => {
	const source = get(interactionSource)
	interactionSource.set(null)
	interactionState.set('select')
	const unit = source && map.layers.units[source]
	if (!unit) return

	highlightActionsList(map, [])
	map.route = []
	if (tile === source) return

	const action = generateActionsList(map, source, unit).find((action) => action.tile === tile)
	if (!action) return

	actionType[action.type]({ map, tile: source, choice: action.tile })
}

const move: Interactor = ({ map, tile, choice, callback }) => {
	const unit = map.layers.units[tile]
	if (!unit || !choice) return

	const destination = generateActionsList(map, tile, unit).find((action) => action.tile === choice)
		?.tile
	if (typeof destination !== 'number') return

	map.layers.units[tile] = null
	animateRoute(map, unit, tile, destination).then(() => {
		map.layers.units[destination] = unit
		runModifiers(unit, 'Move', {
			kind: 'unit',
			tile: destination,
			state: get(gameState),
			map,
		})
		revealCloakedAdjacentTo(map, destination, unit.team)
		if (callback) {
			callback()
		} else {
			openPostMoveMenu(map, destination, unit)
		}
	})
}

const openPostMoveMenu = (map: MapObject, tile: number, unit: UnitObject) => {
	const items = computeAvailableActions({ map, tile, unit })
	openActionMenu(tile, unit.team, items)
}

const attack: Interactor = ({ map, tile, choice }) => {
	const attacker = map.layers.units[tile]
	if (!attacker || !choice) return

	const destination = generateActionsList(map, tile, attacker).find(
		(action) => action.tile === choice
	)?.tile
	const target = destination && map.layers.units[destination]
	if (!target) return

	const path = pathFinder(map, attacker, tile, destination)
	const movementEndTile = path[path.length - 1] ?? tile

	if (path.length > 1) {
		move({
			map,
			tile,
			choice: path[path.length - 1],
			callback: () => performAttack(map, movementEndTile, destination),
		})
	} else {
		performAttack(map, movementEndTile, destination)
	}
}

const reduceHealth = (
	map: MapObject,
	attacker: UnitObject,
	target: UnitObject,
	tile: number,
	role: AttackRole = 'attack'
) => {
	const damage = calculateDamage(attacker, target, { map, defenderTile: tile, role })
	target.health = Math.max((target.health ?? unitData[target.type].health) - damage, 0)
	if (target.health === 0) {
		map.layers.units[tile] = null
		animateExplosion(map, tile)
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

const performAttack = (map: MapObject, attackerTile: number, targetTile: number) => {
	const attacker = map.layers.units[attackerTile]
	const target = map.layers.units[targetTile]
	if (!attacker || !target) return
	animateAttack(map, attacker, attackerTile, targetTile).then(() => {
		const targetDied = reduceHealth(map, attacker, target, targetTile)
		const lanceResult = applyLancePassthrough(map, attackerTile, targetTile)
		if (lanceResult?.killed) {
			animateExplosion(map, lanceResult.tile)
		}
		if (
			!targetDied &&
			canCounterAttack(attacker, target, {
				map,
				attackerTile,
				defenderTile: targetTile,
			})
		) {
			animateAttack(map, target, targetTile, attackerTile).then(() => {
				reduceHealth(map, target, attacker, attackerTile, 'counter')
				applyWinConditions(map)
			})
		} else {
			applyWinConditions(map)
		}
		markTileActed(attackerTile)
		if (targetDied) applyVultureKill(attacker, attackerTile)
	})
}

const selectAttackTarget: Interactor = ({ map, tile }) => {
	const source = get(interactionSource)
	if (source === null) return
	const attacker = map.layers.units[source]
	if (!attacker) return

	const enemies = generateAttackList(map, source, attacker)
	if (!enemies.includes(tile)) return

	interactionSource.set(null)
	interactionState.set('select')
	highlightActionsList(map, [])

	performAttack(map, source, tile)
}

const selectLandTile: Interactor = ({ map, tile }) => {
	const source = get(interactionSource)
	if (source === null) return
	const transport = map.layers.units[source]
	if (!transport) return

	const valid = landTiles(map, source)
	if (!valid.includes(tile)) return

	interactionSource.set(null)
	interactionState.set('select')
	highlightActionsList(map, [])

	landUnload(map, source, tile)
	markTileActed(tile)
	applyWinConditions(map)
}

const hud: Interactor = () => {}

const actionsDecision = {
	select,
	choice,
	move,
	attack,
	selectAttackTarget,
	selectLandTile,
	hud,
} as const

const actionType = [move, attack] as const

export const performMenuAction = (
	map: MapObject,
	actionId: ActionMenuItemId
): void => {
	const menu = get(actionMenuState)
	if (!menu.open || menu.unitTile === null) return
	const tile = menu.unitTile
	const unit = map.layers.units[tile]
	if (!unit) {
		closeActionMenu()
		return
	}

	switch (actionId) {
		case 'wait': {
			closeActionMenu()
			markTileActed(tile)
			applyWinConditions(map)
			return
		}
		case 'attack': {
			closeActionMenu()
			interactionSource.set(tile)
			interactionState.set('selectAttackTarget')
			const targets = generateAttackList(map, tile, unit)
			highlightActionsList(
				map,
				targets.map((t) => ({ tile: t, type: 1, tip: 1 } as unknown as Highlight))
			)
			return
		}
		case 'capture': {
			closeActionMenu()
			runModifiers(unit, 'Start_Turn', {
				kind: 'unit',
				tile,
				state: get(gameState),
				map,
			})
			markTileActed(tile)
			applyWinConditions(map)
			return
		}
		case 'mine': {
			closeActionMenu()
			mine(map, tile, unit.team)
			applyWinConditions(map)
			return
		}
		case 'build': {
			closeActionMenu()
			openBuildMenu(tile, unit.team, 'builder')
			return
		}
		case 'repair': {
			closeActionMenu()
			repair(map, tile, unit.team)
			applyWinConditions(map)
			return
		}
		case 'transport': {
			closeActionMenu()
			const transports = findFriendlyTransporters(map, tile, unit.team)
			const target = transports[0]
			if (typeof target !== 'number') return
			const result = transportLoad(map, tile, target)
			if (result.ok) {
				markTileActed(target)
				applyWinConditions(map)
			}
			return
		}
		case 'ship_out': {
			closeActionMenu()
			const result = shipOut(map, tile)
			if (result.ok) {
				markTileActed(result.transportTile)
				applyWinConditions(map)
			}
			return
		}
		case 'land': {
			closeActionMenu()
			interactionSource.set(tile)
			interactionState.set('selectLandTile')
			const targets = landTiles(map, tile)
			highlightActionsList(
				map,
				targets.map((t) => ({ tile: t, type: 0, tip: 0 } as unknown as Highlight))
			)
			markTileActed(tile)
			return
		}
	}
}

export const cancelMenuAsWait = (map: MapObject): void => {
	const menu = get(actionMenuState)
	if (!menu.open || menu.unitTile === null) {
		closeActionMenu()
		return
	}
	performMenuAction(map, 'wait')
}
