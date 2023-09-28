type ObjectType = {
	type: number
}
type GroundObject = ObjectType
type LocationObject = ObjectType & {
	tile: number
}
type SkyObject = LocationObject
type UnitObject = LocationObject & {
	team: number
}

type MapLayers = {
	ground: GroundObject[]
	sky: (SkyObject | null)[]
	units: (UnitObject | null)[]
}
type MapObject = {
	rows: number
	cols: number
	layers: MapLayers
}

type ObjectDataLoader = {
	sprite: string
}
type ObjectDataLoaded = {
	sprite: HTMLImageElement
}
type ObjectRenderer = {
	ground: (type: number) => HTMLImageElement
	unit: (type: number) => HTMLImageElement
	sky: (type: number) => HTMLImageElement
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
