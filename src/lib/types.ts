/* eslint-disable @typescript-eslint/no-unused-vars */

type ObjectType = {
	type: number
}
type LocationObject = ObjectType & {
	l: number
}
type AnimatedObject = {
	state: number
}
type TeamObject = {
	team: number
}

type GroundObject = ObjectType & AnimatedObject
type SkyObject = ObjectType & AnimatedObject
type UnitObject = ObjectType &
	AnimatedObject &
	TeamObject & {
		health?: number
	}
type BuildingObject = ObjectType & AnimatedObject & TeamObject

type HighlightType = 0 | 1
type HighlightMeta = {
	type: HighlightType
	tip: 0 | 1 | 2 | 3
}
type TileInfo = {
	tile: number
}
type Highlight = TileInfo & HighlightMeta
type Route = {
	state: number
	rotate: number
	index: number
}

type MapLayers = {
	ground: GroundObject[]
	sky: (SkyObject | null)[]
	units: (UnitObject | null)[]
	buildings: (BuildingObject | null)[]
}
type MapLayersData = {
	ground: ObjectType[]
	sky: LocationObject[]
	units: (LocationObject & TeamObject)[]
	buildings: (LocationObject & TeamObject)[]
}
type MapFilters = {
	ground: (active: GroundObject[]) => number[]
	sky: (active: (SkyObject | null)[]) => number[]
	units: (active: (UnitObject | null)[]) => number[]
	buildings: (active: (BuildingObject | null)[]) => number[]
}
type MapObject = {
	title?: string | null
	cols: number
	rows: number
	layers: MapLayers
	filters: MapFilters
	route: (Route | undefined)[]
	highlights: (Highlight | undefined)[]
}
type MapProcesser = {
	title?: string | null
	cols: number
	rows: number
	layers: MapLayers
}
type MapData = {
	title?: string | null
	cols: number
	rows: number
	layers: MapLayersData
}

type RendererMeta = {
	frames: number
	xOffset: number
	yOffset: number
}
type ObjectAssetMeta = RendererMeta & {
	url: string
}
type ObjectSpriteRenderer = RendererMeta & {
	sprite: HTMLImageElement[]
}
type ObjectRenderer = {
	ground: (type: number) => ObjectSpriteRenderer
	sky: (type?: number) => ObjectSpriteRenderer | null
	unit: (type?: number) => ObjectSpriteRenderer | null
	building: (type?: number) => ObjectSpriteRenderer | null
}
type HUDImages = {
	advice: HTMLImageElement
	arrow: HTMLImageElement
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

type Direction =
	| 'topLeft'
	| 'top'
	| 'topRight'
	| 'left'
	| 'center'
	| 'right'
	| 'bottomLeft'
	| 'bottom'
	| 'bottomRight'

type RelationshipStatus = 'unknown' | 'blocked' | 'friends' | 'friend-request'
type Relationship = {
	mine: RelationshipStatus
	theirs: RelationshipStatus
}

type UserDBData = {
	id: number
	auth: string
	username: string
	display_name: string
	profile_image_url: string
	bio: string
	following?: boolean
	follower?: boolean
	relationship?: RelationshipStatus
	messageCount?: number
	created_at: Date
}
type MapDBData = {
	id: number
	sha: string
	owner_auth: string
	name: string
	description: string
	type: string
	info: { info: string; color: string }[]
	thumbnail: string
	url: string
	plays: number
	likes: number
	liked_by_me: number
	shares: number
	trending: boolean
	created_at: Date
	updated_at: Date
}
