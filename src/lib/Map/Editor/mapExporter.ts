import baseX from 'base-x'
import { KEY_SOURCE } from '$lib/Security/keys'

export const mapHasher = (map: MapProcesser) => hash(mapExporter(map))

export const deriveFromHash = (hash?: string, existing: MapProcesser = EMPTY_MAP) =>
	({
		...existing,
		...mapImporter(unhash(hash)),
	}) as MapObject

/**
 * Build a runtime {@link MapObject} from already-parsed editor `MapData` — the
 * same JSON shape `mapExporter` emits, but loaded directly (e.g. a campaign
 * level's `.json`) instead of round-tripped through a base62 hash. Mirrors
 * `deriveFromHash` but skips the (un)hash step, so authored level maps can ship
 * as readable JSON.
 */
export const deriveFromData = (data: MapData, existing: MapProcesser = EMPTY_MAP) =>
	({
		...existing,
		...process(data),
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
		...settings(map),
		layers: {
			ground: map.layers.ground.map(removeState),
			sky: map.layers.sky.map(addLocation).filter(exists),
			units: map.layers.units.map(addUnitLocation).filter(exists),
			buildings: map.layers.buildings.map(addBuildingLocation).filter(exists),
		},
	}) as MapData

const process = (map: MapData) =>
	({
		cols: map.cols,
		rows: map.rows,
		...settings(map),
		layers: {
			ground: map.layers.ground.map((object) => ({ ...object, state: 0 })),
			sky: processObjects(map, map.layers.sky)(processObjectState),
			units: processObjects(map, map.layers.units)(processUnitState),
			buildings: processObjects(map, map.layers.buildings)(processTeamObjectState),
		},
	}) as MapProcesser

const processObjects =
	(map: MapData, objects: LocationObject[]) =>
	<
		T extends
			| typeof processTeamObjectState
			| typeof processObjectState
			| typeof processUnitState,
	>(
		processer: T
	) => {
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

// Units round-trip their carried passenger: a serialized `cargo` (unit type)
// becomes a fresh `rescuedUnit` owned by the carrier's team. Mirrors the in-game
// transport, so an editor-placed loaded transport plays exactly as authored.
const processUnitState =
	(source: (UnitObject | null)[]) =>
	(object: LocationObject & TeamObject & { cargo?: number }) =>
		(source[object.l] = {
			type: object.type,
			team: object.team,
			state: 0,
			...(object.cargo != null
				? { rescuedUnit: { type: object.cargo, team: object.team, state: 0 } }
				: {}),
		} as UnitObject)

const processObjectState =
	<T extends LocationObject>(source: T[]) =>
	(object: T) =>
		(source[object.l] = {
			type: object.type,
			state: 0,
		} as T & AnimatedObject)

/**
 * Carry the optional map-level settings (script / fog / funds) through the
 * (de)serialization round-trip, omitting any that are unset so they never bloat
 * the exported hash with `undefined` keys.
 */
const settings = (map: MapSettings) => {
	const out: MapSettings = {}
	if (map.script != null && map.script !== '') out.script = map.script
	if (map.fog != null) out.fog = map.fog
	if (map.funds != null) out.funds = map.funds
	return out
}

const removeState = <T extends ObjectType>(object: T) => ({ type: object.type })

const exists = <T extends ObjectType>(object: T | null) => object

const addLocation = <T extends ObjectType>(object: T | null, index: number) =>
	!object
		? object
		: ({
				type: object.type,
				l: index,
			} as LocationObject)

const addBuildingLocation = <T extends ObjectType & TeamObject>(object: T | null, index: number) =>
	!object
		? object
		: ({
				type: object.type,
				team: object.team,
				l: index,
			} as LocationObject)

// Units serialize like buildings but also persist any carried passenger as a
// compact `cargo` type (the rescuedUnit). Empty transports omit the field.
const addUnitLocation = (object: UnitObject | null, index: number) =>
	!object
		? object
		: ({
				type: object.type,
				team: object.team,
				l: index,
				...(object.rescuedUnit ? { cargo: object.rescuedUnit.type } : {}),
			} as LocationObject & TeamObject & { cargo?: number })
