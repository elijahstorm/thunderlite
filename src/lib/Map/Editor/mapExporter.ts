import baseX from 'base-x'
import { KEY_SOURCE } from '$lib/Security/keys'

export const mapHasher = (map: MapProcesser) => hash(mapExporter(map))

export const deriveFromHash = (hash?: string, existing: MapProcesser = EMPTY_MAP) =>
	({
		...existing,
		...mapImporter(unhash(hash)),
	}) as MapObject

const filterUnsed = <T>(active: T[]) =>
	active.filter((data) => data !== null).map((data) => (data as ObjectType).type)

const EMPTY_MAP: MapObject = {
	title: 'rose gold',
	cols: 10,
	rows: 10,
	layers: {
		ground: Array.from({ length: 100 }, () => ({
			type: 0,
			state: 0,
		})),
		sky: [],
		units: [],
		buildings: [],
	},
	filters: {
		ground: filterUnsed,
		sky: filterUnsed,
		units: filterUnsed,
		buildings: filterUnsed,
	},
	highlights: [],
	route: [],
}

const base62 = baseX(KEY_SOURCE)

const hash = (content: string) => base62.encode(new TextEncoder().encode(content))

const unhash = (content?: string) =>
	content ? new TextDecoder().decode(base62.decode(content)) : undefined

const mapExporter = (map: MapProcesser) => JSON.stringify(filter(map))

const mapImporter = (content?: string) => (content ? process(JSON.parse(content)) : {})

const filter = (map: MapProcesser) =>
	({
		cols: map.cols,
		rows: map.rows,
		layers: {
			ground: map.layers.ground.map(removeState),
			sky: map.layers.sky.map(addLocation).filter(exists),
			units: map.layers.units.map(addUnitLocation).filter(exists),
			buildings: map.layers.buildings.map(addUnitLocation).filter(exists),
		},
	}) as MapData

const process = (map: MapData) =>
	({
		cols: map.cols,
		rows: map.rows,
		layers: {
			ground: map.layers.ground.map((object) => ({ ...object, state: 0 })),
			sky: processObjects(map, map.layers.sky)(processObjectState),
			units: processObjects(map, map.layers.units)(processTeamObjectState),
			buildings: processObjects(map, map.layers.buildings)(processTeamObjectState),
		},
	}) as MapProcesser

const processObjects =
	(map: MapData, objects: LocationObject[]) =>
	<T extends typeof processTeamObjectState | typeof processObjectState>(processer: T) => {
		const result = new Array(map.cols * map.rows)
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		objects?.forEach(processer(result))
		return result as ReturnType<ReturnType<T>>[]
	}

const processTeamObjectState =
	<T extends LocationObject & TeamObject>(source: T[]) =>
	(object: T) =>
		(source[object.l] = {
			type: object.type,
			team: object.team,
			state: 0,
		} as T & AnimatedObject)

const processObjectState =
	<T extends LocationObject>(source: T[]) =>
	(object: T) =>
		(source[object.l] = {
			type: object.type,
			state: 0,
		} as T & AnimatedObject)

const removeState = <T extends ObjectType>(object: T) => ({ type: object.type })

const exists = <T extends ObjectType>(object: T | null) => object

const addLocation = <T extends ObjectType>(object: T | null, index: number) =>
	!object
		? object
		: ({
				type: object.type,
				l: index,
		  } as LocationObject)

const addUnitLocation = <T extends ObjectType & TeamObject>(object: T | null, index: number) =>
	!object
		? object
		: ({
				type: object.type,
				team: object.team,
				l: index,
		  } as LocationObject)
