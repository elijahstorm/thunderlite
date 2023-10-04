/* eslint-disable @typescript-eslint/no-unused-vars */

type ObjectType = {
	type: number
}
type AnimatedObject = {
	state: number
}
type GroundObject = ObjectType & AnimatedObject
type LocationObject = ObjectType &
	AnimatedObject & {
		tile: number
	}
type SkyObject = LocationObject & AnimatedObject
type UnitObject = LocationObject &
	AnimatedObject & {
		team: number
	}

type MapLayers = {
	ground: GroundObject[]
	sky: (SkyObject | null)[]
	units: (UnitObject | null)[]
}
type MapFilters = {
	ground: (active: GroundObject[]) => number[]
	sky: (active: (SkyObject | null)[]) => number[]
	units: (active: (UnitObject | null)[]) => number[]
}
type MapObject = {
	rows: number
	cols: number
	layers: MapLayers
	filters: MapFilters
}

type ObjectDataLoader = {
	sprite: string
}
type ObjectDataLoaded = {
	sprite: HTMLImageElement
}
type ObjectSpecificRenderer = {
	sprite: HTMLImageElement
	frames: number
	xOffset: number
	yOffset: number
}
type ObjectRenderer = {
	ground: (type: number) => ObjectSpecificRenderer
	unit: (type?: number) => ObjectSpecificRenderer | null
	sky: (type?: number) => ObjectSpecificRenderer | null
}

type SpriteObject = ObjectSpecificRenderer & {
	url: string
}

type InterfaceInteraction = {
	selected: {
		x: number
		y: number
	}
	hover: {
		x: number
		y: number
	}
	offset: {
		x: number
		y: number
		zoom: number
	}
	key: {
		key: string
		shift: boolean
	}
}
