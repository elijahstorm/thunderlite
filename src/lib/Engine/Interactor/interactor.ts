import { animate } from '../Animator/animator'
import { generateMovementList } from './movement'

type Interaction = {
	map: MapObject
	tile: number
	choice?: string
	action?: keyof typeof actionsDecision
}

type Interactor = (interaction: Interaction) => void

export const interactor: Interactor = (interaction) =>
	verifyInteraction(interaction) && actionsDecision[interaction.action ?? 'select'](interaction)

const verifyInteraction = (obj: object) => Object.hasOwn(obj, 'tile') && Object.hasOwn(obj, 'map')

const select: Interactor = ({ map, tile }) => {
	move({ map, tile, choice: '0' })
}

const move: Interactor = ({ map, tile, choice }) => {
	const unit = map.layers.units[tile]
	if (!unit || !choice) return
	const destination = generateMovementList(map, tile, unit)[parseInt(choice)]
	if (!destination) return
	animate(map, tile, destination)
	map.layers.units[tile] = null
	map.layers.units[destination] = unit
}

const actionsDecision = {
	select,
	move,
} as const
