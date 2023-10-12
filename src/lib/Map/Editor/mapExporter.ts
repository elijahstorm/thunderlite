import { terrainData } from '$lib/GameData/terrain'
import { unitData } from '$lib/GameData/unit'
import { skyData } from '$lib/GameData/sky'
import baseX from 'base-x'

export const mapHasher = (map: MapObject) => hash(mapExporter(map))

export const deriveFromHash = (hash?: string) =>
	({
		...EMPTY_MAP,
		...mapImporter(unhash(hash)),
	}) as MapObject

const EMPTY_MAP = {
	title: 'rose gold',
	cols: 10,
	rows: 10,
	layers: {
		ground: new Array(100).fill(0).map(() => ({
			type: 0,
			state: 0,
		})),
		units: [],
		sky: [],
	},
	filters: {
		ground: () => Array.from({ length: terrainData.length }, (_, index) => index),
		units: () => Array.from({ length: unitData.length }, (_, index) => index),
		sky: () => Array.from({ length: skyData.length }, (_, index) => index),
	},
}

const base62 = baseX('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')

const hash = (content: string) => base62.encode(new TextEncoder().encode(content))

const unhash = (content?: string) =>
	content ? new TextDecoder().decode(base62.decode(content)) : undefined

const mapExporter = (map: MapObject) => JSON.stringify(filter(map))

const mapImporter = (content?: string) => (content ? process(JSON.parse(content)) : {})

const filter = (map: MapObject) =>
	({
		cols: map.cols,
		rows: map.rows,
		layers: {
			ground: map.layers.ground.map(removeState),
			units: map.layers.units.map(addUnitLocation).filter(exists),
			sky: map.layers.sky.map(addLocation).filter(exists),
		},
	}) as MapData

const process = (map: MapData) =>
	({
		cols: map.cols,
		rows: map.rows,
		layers: {
			ground: map.layers.ground.map((object) => ({ ...object, state: 0 })),
			units: processObjects(map, map.layers.units)(processTeamObjectState),
			sky: processObjects(map, map.layers.sky)(processObjectState),
		},
	}) as MapProcesser

const processObjects =
	(map: MapData, objects: LocationObject[]) =>
	<T extends typeof processTeamObjectState | typeof processObjectState>(processer: T) => {
		const result = new Array(map.cols * map.rows)
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		objects.forEach(processer(result))
		return result as ReturnType<ReturnType<T>>[]
	}

const processTeamObjectState =
	<T extends LocationObject & TeamObject>(source: T[]) =>
	(object: T) =>
		(source[object.l] = {
			type: object.type,
			team: object.team,
			state: 4,
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
