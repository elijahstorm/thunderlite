import { highlightActionsList, generateActionsList } from '$lib/Layers/tileHighlighter'
import { get } from 'svelte/store'
import { animateRoute, animateAttack, animateExplosion } from '../Animator/animator'
import { interactionSource, interactionState } from './interactionState'
import { unitData } from '$lib/GameData/unit'
import { pathFinder } from './Pathing/pathFinder'
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
	if (!unit) return

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
	if (!destination) return

	map.layers.units[tile] = null
	animateRoute(map, unit, tile, destination).then(() => {
		map.layers.units[destination] = unit
		if (callback) callback()
	})
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
	const reduceHealth = (map: MapObject, attacker: UnitObject, target: UnitObject, tile: number) => {
		target.health = Math.max(
			(target.health ?? unitData[target.type].health) - unitData[attacker.type].power,
			0
		)
		if (target.health === 0) {
			map.layers.units[tile] = null
			animateExplosion(map, tile)
			return true
		}
		return false
	}
	const performAttack = () =>
		animateAttack(map, attacker, movementEndTile, destination).then(() => {
			const targetDied = reduceHealth(map, attacker, target, destination)
			if (
				!targetDied &&
				unitData[target.type].power !== 0 &&
				generateAttackList(map, destination, target).includes(movementEndTile)
			) {
				animateAttack(map, target, destination, movementEndTile).then(() =>
					reduceHealth(map, target, attacker, movementEndTile)
				)
			}
		})

	if (path.length > 1) {
		move({
			map,
			tile,
			choice: path[path.length - 1],
			callback: performAttack,
		})
	} else {
		performAttack()
	}
}

const hud: Interactor = () => {
	/**
	 * gameplay sprint
	 * ---
	 * todo
	 * 4 add game state (user turn)
	 * 5 add selectable unit HUD UI
	 * 7 synch auth states (fake and real) in both servers
	 * 8 socket logic for auth and game management
	 */
}

const actionsDecision = {
	select,
	choice,
	move,
	attack,
	hud,
} as const

const actionType = [move, attack] as const
