import {
	highlightActionsList,
	generateActionsList,
	generatePreviewList,
} from '$lib/Layers/tileHighlighter'
import { computeThreatTiles } from './Pathing/threat'
import { get } from 'svelte/store'
import { animateRoute, animateAttack, animateExplosion } from '../Animator/animator'
import { interactionSource, interactionState } from './interactionState'
import { buildingData } from '$lib/GameData/building'
import { unitData } from '$lib/GameData/unit'
import { pathFinder } from './Pathing/pathFinder'
import { canSelectUnit, gameState, markTileActed } from '../gameState'
import { openBuildMenu } from '../HUD/buildMenuStore'
import { applyAction } from '../applyAction'
import { emitOutgoingAction } from '../outgoingActions'
import { findFriendlyTransporters, shipOut } from '../modifiers/transport'
import { applyWinConditions } from '../winConditions'
import { computeAvailableActions, type ActionMenuItemId } from '../actions'
import { openActionMenu, closeActionMenu, actionMenuState } from '../HUD/actionMenuStore'
import { generateAttackList } from './Pathing/attack'
import type { SerializedAction } from './serializedAction'

const tilesAreAdjacent = (map: MapObject, a: number, b: number): boolean => {
	if (a === b) return false
	const ax = a % map.cols
	const bx = b % map.cols
	const ay = Math.floor(a / map.cols)
	const by = Math.floor(b / map.cols)
	return (Math.abs(ax - bx) === 1 && ay === by) || (Math.abs(ay - by) === 1 && ax === bx)
}

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

const commit = (map: MapObject, action: SerializedAction): void => {
	// `live: true` — locally-initiated action, so fire its SFX. Replayed and
	// relayed actions go through `applyAction` directly and stay silent.
	applyAction(map, action, { live: true })
	emitOutgoingAction(action)
}

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
	const state = get(gameState)
	if (!canSelectUnit(unit, tile, state)) {
		// Not commandable (enemy unit, or one that has already acted) — show a
		// read-only preview of its movement + attack reach rather than selecting it.
		if (state.phase !== 'playing') return
		highlightActionsList(map, generatePreviewList(map, tile, unit))
		interactionSource.set(null)
		interactionState.set('preview')
		map.pathHistory = []
		return
	}

	highlightActionsList(map, generateActionsList(map, tile, unit, computeThreatTiles(map, unit.team)))
	interactionSource.set(tile)
	interactionState.set('choice')
	map.pathHistory = [tile]
}

const preview: Interactor = (interaction) => {
	// Any click dismisses the read-only preview, then re-runs selection on the
	// clicked tile so tapping another unit previews/selects it without a dead click.
	interactionState.set('select')
	highlightActionsList(interaction.map, [])
	interaction.map.route = []
	interaction.map.pathHistory = []
	select(interaction)
}

const choice: Interactor = ({ map, tile }) => {
	const source = get(interactionSource)
	interactionSource.set(null)
	interactionState.set('select')
	const unit = source && map.layers.units[source]
	if (!unit) {
		map.pathHistory = []
		return
	}

	highlightActionsList(map, [])
	map.route = []
	if (tile === source) {
		map.pathHistory = []
		return
	}

	const action = generateActionsList(map, source, unit).find((action) => action.tile === tile)
	if (!action) {
		map.pathHistory = []
		return
	}

	// Hand off to move/attack. They read map.pathHistory (set during hover) to
	// drive the actual route the unit walks, then clear it once consumed.
	actionType[action.type]({ map, tile: source, choice: action.tile })
}

const move: Interactor = ({ map, tile, choice, callback }) => {
	const unit = map.layers.units[tile]
	if (!unit || !choice) {
		map.pathHistory = []
		return
	}

	const destination = generateActionsList(map, tile, unit).find(
		(action) => action.tile === choice
	)?.tile
	if (typeof destination !== 'number') {
		map.pathHistory = []
		return
	}

	// Walk the route the user actually drew with their cursor when it matches the
	// chosen destination. If the click somehow arrives without a matching history
	// (e.g. touch input, or the action came from the post-move menu), pathfind it.
	const userPath = map.pathHistory
	const route =
		userPath &&
		userPath.length > 1 &&
		userPath[0] === tile &&
		userPath[userPath.length - 1] === destination
			? userPath.slice()
			: pathFinder(map, unit, tile, destination)
	map.pathHistory = []

	map.layers.units[tile] = null
	animateRoute(map, unit, tile, destination, route).then(() => {
		map.layers.units[tile] = unit
		commit(map, { kind: 'move', from: tile, to: destination })
		if (callback) {
			callback()
		} else {
			openPostMoveMenu(map, destination, unit)
		}
	})
}

const openPostMoveMenu = (map: MapObject, tile: number, unit: UnitObject) => {
	const items = computeAvailableActions({ map, tile, unit })
	// `wait` is always offered last, so a single item means it's the only choice —
	// skip the menu entirely and commit the wait so the unit just finishes in place.
	if (items.length === 1 && items[0].id === 'wait') {
		commit(map, { kind: 'wait', tile })
		return
	}
	openActionMenu(tile, unit.team, items)
}

const attack: Interactor = ({ map, tile, choice }) => {
	const attacker = map.layers.units[tile]
	if (!attacker || !choice) {
		map.pathHistory = []
		return
	}

	const destination = generateActionsList(map, tile, attacker).find(
		(action) => action.tile === choice
	)?.tile
	if (destination === undefined) {
		map.pathHistory = []
		return
	}
	const target = map.layers.units[destination]
	if (!target) {
		map.pathHistory = []
		return
	}

	// Honor the player's hovered approach when it lands on a walkable tile that's
	// already adjacent to the target. That lets them dictate which side of the
	// target the attacker ends up on, instead of inheriting the BFS tie-break.
	const isMelee = unitData[attacker.type].range[0] === 1
	const userPath = map.pathHistory
	const userEnd = userPath && userPath.length ? userPath[userPath.length - 1] : null
	const userPathUsable =
		isMelee &&
		userPath &&
		userPath.length >= 1 &&
		userPath[0] === tile &&
		userEnd !== null &&
		tilesAreAdjacent(map, userEnd, destination) &&
		(userEnd === tile || !map.layers.units[userEnd])

	const path = userPathUsable ? userPath!.slice() : pathFinder(map, attacker, tile, destination)
	const movementEndTile = path[path.length - 1] ?? tile

	if (path.length > 1) {
		// move() reads map.pathHistory to walk the exact route — make sure it sees
		// the path we just committed to, not a stale (or absent) history.
		map.pathHistory = path
		move({
			map,
			tile,
			choice: movementEndTile,
			callback: () => performAttack(map, movementEndTile, destination),
		})
	} else {
		map.pathHistory = []
		performAttack(map, movementEndTile, destination)
	}
}

const performAttack = (map: MapObject, attackerTile: number, targetTile: number) => {
	const attacker = map.layers.units[attackerTile]
	const target = map.layers.units[targetTile]
	if (!attacker || !target) return
	animateAttack(map, attacker, attackerTile, targetTile).then(() => {
		const targetWillDie = (target.health ?? 0) > 0
		commit(map, { kind: 'attack', from: attackerTile, to: targetTile })
		if (targetWillDie && map.layers.units[targetTile] == null) {
			animateExplosion(map, targetTile)
		}
		if (map.layers.units[attackerTile] == null) {
			animateExplosion(map, attackerTile)
		}
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
	map.pathHistory = []

	performAttack(map, source, tile)
}

const selectLandTile: Interactor = ({ map, tile }) => {
	const source = get(interactionSource)
	if (source === null) return
	const transport = map.layers.units[source]
	if (!transport) return

	interactionSource.set(null)
	interactionState.set('select')
	highlightActionsList(map, [])
	map.pathHistory = []

	commit(map, { kind: 'transport-unload', transport: source, tile })
}

// Forfeit the match for `team`. Routed through `commit` like any other action so
// it applies locally (and fires its match-end flow) and relays to an online
// opponent. Safe in single-player too — the local interactor just applies it.
export const surrender = (map: MapObject, team: number): void => {
	commit(map, { kind: 'surrender', team })
}

const hud: Interactor = () => {}

const actionsDecision = {
	select,
	choice,
	preview,
	move,
	attack,
	selectAttackTarget,
	selectLandTile,
	hud,
} as const

const actionType = [move, attack] as const

export const performMenuAction = (map: MapObject, actionId: ActionMenuItemId): void => {
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
			commit(map, { kind: 'wait', tile })
			return
		}
		case 'attack': {
			closeActionMenu()
			interactionSource.set(tile)
			interactionState.set('selectAttackTarget')
			const targets = generateAttackList(map, tile, unit)
			highlightActionsList(
				map,
				targets.map((t): TileHighlight => ({ tile: t, type: 1, tip: 1 }))
			)
			return
		}
		case 'capture': {
			closeActionMenu()
			commit(map, { kind: 'capture', tile })
			return
		}
		case 'mine': {
			closeActionMenu()
			commit(map, { kind: 'mine', tile })
			return
		}
		case 'build': {
			closeActionMenu()
			openBuildMenu(tile, unit.team, 'builder')
			return
		}
		case 'repair': {
			closeActionMenu()
			commit(map, { kind: 'repair', tile })
			return
		}
		case 'transport': {
			closeActionMenu()
			const transports = findFriendlyTransporters(map, tile, unit.team)
			const transport = transports[0]
			if (typeof transport !== 'number') return
			commit(map, { kind: 'transport-load', transport, passenger: tile })
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
