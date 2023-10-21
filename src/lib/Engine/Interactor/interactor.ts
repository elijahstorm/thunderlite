import { highlightMovementList } from '$lib/Layers/tileHighlighter'
import { get } from 'svelte/store'
import { animate } from '../Animator/animator'
import { generateMovementList } from './movement'
import { interactionChoice, interactionState } from './interactionState'

type Interaction = {
	map: MapObject
	tile: number
	choice?: number
	action?: keyof typeof actionsDecision
}

type Interactor = (interaction: Interaction) => void

export const interactor: Interactor = (interaction) =>
	verifyInteraction(interaction) &&
	actionsDecision[interaction.action ?? get(interactionState)](interaction)

const verifyInteraction = (obj: object) => Object.hasOwn(obj, 'tile') && Object.hasOwn(obj, 'map')

const select: Interactor = ({ map, tile }) => {
	const unit = map.layers.units[tile]
	if (!unit) return
	highlightMovementList(map, generateMovementList(map, tile, unit), unit)
	interactionState.set('choice')
	interactionChoice.set(tile)
}

const choice: Interactor = ({ map, tile }) => {
	const source = get(interactionChoice)
	if (!source) return
	const unit = map.layers.units[source]
	if (!unit) return
	highlightMovementList(map, [], unit)
	interactionState.set('select')
	interactionChoice.set(undefined)
	const movesList = generateMovementList(map, source, unit)
	if (!movesList.includes(tile)) return
	move({ map, tile: source, choice: movesList.indexOf(tile) })
}

const move: Interactor = ({ map, tile, choice }) => {
	const unit = map.layers.units[tile]
	if (!unit || !choice) return
	const destination = generateMovementList(map, tile, unit)[choice]
	if (!destination) return
	animate(map, tile, destination)
	map.layers.units[tile] = null
	map.layers.units[destination] = unit
}

const hud: Interactor = () => {}

const actionsDecision = {
	select,
	choice,
	move,
	hud,
} as const
