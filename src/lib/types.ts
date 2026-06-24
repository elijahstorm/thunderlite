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

type GroundObject = ObjectType &
	AnimatedObject & {
		// Transient render hint: inner-corner sprite frames (16-19) to composite over
		// the base tile. A water tile can need several at once, which `state` alone
		// (one frame) can't express. Recomputed alongside `state`; see spriteConnector.
		corners?: number[]
	}
type SkyObject = ObjectType & AnimatedObject
type UnitObject = ObjectType &
	AnimatedObject &
	TeamObject & {
		health?: number
		hidden?: boolean
		// Builder units (Warmachine) carry their own funds, separate from the player's
		// money pool: they pay for the units they build out of this wallet and refill
		// it by mining ore. Absent until first read/mutation — reads default to the
		// type's starting wallet (see Engine/wallet.ts), exactly like `health` defaults
		// to the unit's max, so map-placed and freshly-built Warmachines both start full.
		wallet?: number
		rescuedUnit?: UnitObject | null
		// Transient render flag: true while this unit is mid attack-animation. It
		// stays on the map (so it keeps contributing fog-of-war sight) but the
		// canvas skips its idle sprite so the attack overlay shows alone.
		animating?: boolean
		// Transient render value: the health the bar currently *shows*. After combat
		// it's eased toward the real `health` so the bar slides instead of snapping,
		// then cleared. Paint falls back to `health` whenever it's absent.
		displayHealth?: number
		// Set when the unit attacks; consumed at the start of its next turn by the
		// auto-capture handler so a unit that attacked can't also capture that turn.
		// Only carried by capture-capable units (set behind that check in applyAttack).
		attacked?: boolean
	}
type BuildingObject = ObjectType &
	AnimatedObject &
	TeamObject & {
		stature?: number
		// Remaining funds reservoir for income buildings (City/Oil). Pays the type's
		// full `income` each turn until drained, then only a small trickle. Absent
		// until first paid out — reads default to the type's starting `resources`,
		// the same lazy-default pattern as `stature`/`health`. See modifiers/supplyIncome.
		resources?: number
	}

type TileHighlightType = 0 | 1
type HighlightMeta = {
	type: TileHighlightType
	tip: 0 | 1 | 2 | 3
	/** True when a movement tile sits inside an enemy's attack reach. Raises the
	 * move tile's advice badge to the danger ("bad") severity. */
	threatened?: boolean
	/** True for a tile inside an indirect unit's geometric range that terrain
	 * height (or a Trench) puts in firing shadow — drawn with the shadow overlay
	 * but not actually targetable. See shadowedAttackTiles / paint highlights. */
	shadowed?: boolean
	/** True for the selected unit's *own* tile. It's a member of the movement list
	 * (a unit can always "stay put") but shouldn't read as a green move target —
	 * the renderer paints it a muted amber to signal that clicking it opens the
	 * unit's action menu rather than moving it. */
	origin?: boolean
}
type TileInfo = {
	tile: number
}
type TileHighlight = TileInfo & HighlightMeta
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
	// `cargo` is the unit type a transport is carrying (its rescuedUnit). The
	// passenger always belongs to the carrier's team, so only the type is stored.
	units: (LocationObject & TeamObject & { cargo?: number })[]
	buildings: (LocationObject & TeamObject)[]
}
type MapFilters = {
	ground: (active: GroundObject[]) => number[]
	sky: (active: (SkyObject | null)[]) => number[]
	units: (active: (UnitObject | null)[]) => number[]
	buildings: (active: (BuildingObject | null)[]) => number[]
}
/** Map-level rules authored in the editor and carried through save/share/play. */
type MapSettings = {
	/** Author's level script in the cutscene DSL (see docs/map-scripting.md). */
	script?: string
	/** Whether the match runs with fog of war. Defaults to on when unset. */
	fog?: boolean
	/** Starting funds granted to every team. Defaults to 0 when unset. */
	funds?: number
}
type MapObject = MapSettings & {
	title?: string | null
	cols: number
	rows: number
	layers: MapLayers
	filters: MapFilters
	route: (Route | undefined)[]
	highlights: (TileHighlight | undefined)[]
	pathHistory?: number[]
	pointers?: Set<number>
	/** Tiles painted by the persistent enemy-threat overlay (every reach tile of
	 * the enemy units the player has toggled on). Recomputed in `MapRender` from
	 * the `shownThreatUnits` store; see `threatOverlay.ts`. */
	threatTiles?: Set<number>
}
type MapProcesser = MapSettings & {
	title?: string | null
	cols: number
	rows: number
	layers: MapLayers
}
type MapData = MapSettings & {
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
	animation: (type: number) => ObjectSpriteRenderer | null
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

type MessageDBData = {
	source: string
	target: string
	message: string
	created_at: Date
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
	last_message?: {
		message: string
		unread: boolean
		when: Date
	}
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
