type Interaction = {
	map: MapObject
	tile: number
	action: string
}

type Interactor = (interaction: Interaction) => void

export const interactor: Interactor = ({ map, tile, action }) => {
	tile
	action
	map.layers.ground[tile] = {
		type: 8,
		state: 0,
	}
}
