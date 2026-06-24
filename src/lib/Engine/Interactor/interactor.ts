import { addToast } from 'as-toast'
import {
	highlightActionsList,
	generateActionsList,
	generatePreviewList,
	findActionAtTile,
} from '$lib/Layers/tileHighlighter'
import { computeThreatTiles } from './Pathing/threat'
import { toggleThreatUnit, viewerTeam } from '../threatOverlay'
import { get } from 'svelte/store'
import { animateRoute, animateHealthBar } from '../Animator/animator'
import { animateAttackSequence } from '../attackSequence'
import { interactionSource, interactionState } from './interactionState'
import { buildingData } from '$lib/GameData/building'
import { unitData } from '$lib/GameData/unit'
import { pathFinder } from './Pathing/pathFinder'
import { truncateRouteAtCollision } from './Pathing/movement'
import { concealedEnemyTiles } from '../visibility'
import { canSelectUnit, gameState } from '../gameState'
import { openBuildMenu, closeBuildMenu } from '../HUD/buildMenuStore'
import { applyAction } from '../applyAction'
import { emitOutgoingAction } from '../outgoingActions'
import { airLift, findFriendlyTransporters, shipOut } from '../modifiers/transport'
import { buildAdjacent, buildableAdjacentTiles } from '../modifiers/builder'
import { audioEngine } from '$lib/Audio/audioEngine'
import { sfxForAction } from '$lib/Audio/sfxMap'
import { applyWinConditions } from '../winConditions'
import { computeAvailableActions, type ActionMenuItemId } from '../actions'
import {
	openActionMenu,
	closeActionMenu,
	peekActionMenu,
	actionMenuState,
} from '../HUD/actionMenuStore'
import { generateAttackList } from './Pathing/attack'
import type { SerializedAction } from './serializedAction'

const tilesAreAdjacent = (map: MapObject, a: number, b: number): boolean => {
	if (a === b) return false
	const ax = a % map.cols
	const bx = b % map.cols
	const ay = Math.floor(a / map.cols)
	const by = Math.floor(b / map.cols)
	return (Math.abs(ax - bx) === 1 && ay === by) || (Math.abs(ay - by) === 1 && ax === bx)
}

type Interaction = {
	map: MapObject
	tile: number
	choice?: number
	action?: keyof typeof actionsDecision
	callback?: VoidFunction
}

type Interactor = (interaction: Interaction) => void

export const interactor: Interactor = (interaction) =>
	verifyInteraction(interaction) &&
	actionsDecision[interaction.action ?? get(interactionState)](interaction)

const verifyInteraction = (obj: object) => Object.hasOwn(obj, 'tile') && Object.hasOwn(obj, 'map')

const commit = (map: MapObject, action: SerializedAction): void => {
	// `live: true` — locally-initiated action, so fire its SFX. Replayed and
	// relayed actions go through `applyAction` directly and stay silent.
	applyAction(map, action, { live: true })
	emitOutgoingAction(action)
}

const select: Interactor = ({ map, tile }) => {
	const unit = map.layers.units[tile]
	if (!unit) {
		const building = map.layers.buildings[tile]
		if (building && buildingData[building.type]?.actable) {
			const state = get(gameState)
			if (
				state.phase === 'playing' &&
				building.team === state.currentTeam &&
				!state.actedTiles.has(tile)
			) {
				openBuildMenu(tile, building.team)
				return
			}
		}
		// Dead click — empty ground, or a building we can't act on. Wipe any selection
		// highlight / route arrows still painted from an interrupted selection so the
		// board never gets visually "stuck": without this, leftover move-tiles can't be
		// dismissed by clicking elsewhere — every empty-tile click just no-ops while the
		// stale overlay lingers. (The persistent enemy-threat overlay lives in its own
		// store, so this only clears the transient move/attack highlights.)
		highlightActionsList(map, [])
		map.route = []
		map.pathHistory = []
		return
	}
	const state = get(gameState)
	if (!canSelectUnit(unit, tile, state)) {
		if (state.phase !== 'playing') return
		// Enemy unit: toggle its attack reach in the persistent threat overlay, the
		// planning aid for seeing where you'd be exposed. Lets the player build up a
		// combined danger map across several enemies instead of inspecting them one
		// at a time. (Own already-acted units fall through to the transient preview.)
		if (unit.team !== get(viewerTeam)) {
			toggleThreatUnit(tile)
			return
		}
		// Own unit that has already acted — show a read-only preview of its
		// movement + attack reach rather than selecting it.
		highlightActionsList(map, generatePreviewList(map, tile, unit))
		interactionSource.set(null)
		interactionState.set('preview')
		map.pathHistory = []
		return
	}

	highlightActionsList(
		map,
		generateActionsList(map, tile, unit, computeThreatTiles(map, unit.team))
	)
	interactionSource.set(tile)
	interactionState.set('choice')
	map.pathHistory = [tile]
}

const preview: Interactor = (interaction) => {
	// Any click dismisses the read-only preview, then re-runs selection on the
	// clicked tile so tapping another unit previews/selects it without a dead click.
	interactionState.set('select')
	highlightActionsList(interaction.map, [])
	interaction.map.route = []
	interaction.map.pathHistory = []
	select(interaction)
}

const choice: Interactor = ({ map, tile }) => {
	const source = get(interactionSource)
	interactionSource.set(null)
	interactionState.set('select')
	// `source === null` is the only "no selection" case — tile index 0 is a valid
	// source, so guard with an explicit null check rather than truthiness (the old
	// `source && …` evaluated to 0 for a unit on tile 0, making it un-commandable).
	const unit = source === null ? null : map.layers.units[source]
	if (source === null || !unit) {
		// The selection's unit is gone (moved, died, or a stale source carried over a
		// turn). Clear the leftover highlights/route too, not just the path history —
		// otherwise the orphaned move-tiles stay painted with nothing able to dismiss
		// them, which reads as a softlock.
		highlightActionsList(map, [])
		map.route = []
		map.pathHistory = []
		return
	}

	highlightActionsList(map, [])
	map.route = []
	if (tile === source) {
		map.pathHistory = []
		// Clicking the selected unit again offers its stationary actions (build,
		// capture, etc.) instead of just deselecting — this is the only way to build
		// without moving, which is what keeps a Warmachine from moving *and* building
		// in one turn. Falls through to a plain deselect when nothing can be done in
		// place.
		maybeOpenInPlaceMenu(map, source, unit)
		return
	}

	const action = findActionAtTile(generateActionsList(map, source, unit), tile)
	if (!action) {
		map.pathHistory = []
		return
	}

	// Hand off to move/attack. They read map.pathHistory (set during hover) to
	// drive the actual route the unit walks, then clear it once consumed.
	actionType[action.type]({ map, tile: source, choice: action.tile })
}

const move: Interactor = ({ map, tile, choice, callback }) => {
	const unit = map.layers.units[tile]
	// `choice` is the destination tile index; `=== undefined`, not `!choice`, because
	// tile 0 is a real destination and `!0` would silently abort a move onto the
	// board's top-left corner.
	if (!unit || choice === undefined) {
		map.pathHistory = []
		return
	}

	const destination = findActionAtTile(generateActionsList(map, tile, unit), choice)?.tile
	if (typeof destination !== 'number') {
		map.pathHistory = []
		return
	}

	// Walk the route the user actually drew with their cursor when it matches the
	// chosen destination. If the click somehow arrives without a matching history
	// (e.g. touch input, or the action came from the post-move menu), pathfind it.
	const concealed = concealedEnemyTiles(map, unit.team)
	const userPath = map.pathHistory
	const plannedRoute =
		userPath &&
		userPath.length > 1 &&
		userPath[0] === tile &&
		userPath[userPath.length - 1] === destination
			? userPath.slice()
			: pathFinder(map, unit, tile, destination, concealed)
	map.pathHistory = []

	// In fog / against stealth the planned route can run through an enemy the player
	// couldn't see. Stop on the last clear tile: the unit walks into the ambush,
	// halts, and its turn ends — no post-move menu, and any queued attack is aborted.
	const { route, collided } = truncateRouteAtCollision(map, plannedRoute, unit.team)
	const finalTile = route.length > 0 ? route[route.length - 1] : destination

	// Collided before taking a single step (a concealed enemy sits adjacent): the
	// unit forfeits its move in place.
	if (collided && finalTile === tile) {
		commit(map, { kind: 'wait', tile })
		return
	}

	map.layers.units[tile] = null
	animateRoute(map, unit, tile, finalTile, route).then(() => {
		map.layers.units[tile] = unit
		commit(map, { kind: 'move', from: tile, to: finalTile })
		// Walked into a concealed enemy mid-route: turn over, skip menu / callback.
		if (collided) return
		if (callback) {
			callback()
		} else {
			openPostMoveMenu(map, finalTile, unit)
		}
	})
}

const openPostMoveMenu = (map: MapObject, tile: number, unit: UnitObject) => {
	const items = computeAvailableActions({ map, tile, unit, moved: true })
	// `wait` is always offered last, so a single item means it's the only choice —
	// skip the menu entirely and commit the wait so the unit just finishes in place.
	if (items.length === 1 && items[0].id === 'wait') {
		commit(map, { kind: 'wait', tile })
		return
	}
	openActionMenu(tile, unit.team, items)
}

const attack: Interactor = ({ map, tile, choice }) => {
	const attacker = map.layers.units[tile]
	// `choice === undefined` rather than `!choice` — tile index 0 is a valid target
	// reference, and `!0` would drop an attack resolved against the corner tile.
	if (!attacker || choice === undefined) {
		map.pathHistory = []
		return
	}

	const destination = findActionAtTile(generateActionsList(map, tile, attacker), choice)?.tile
	if (destination === undefined) {
		map.pathHistory = []
		return
	}
	const target = map.layers.units[destination]
	if (!target) {
		map.pathHistory = []
		return
	}

	// Honor the player's hovered approach when it lands on a walkable tile that's
	// already adjacent to the target. That lets them dictate which side of the
	// target the attacker ends up on, instead of inheriting the BFS tie-break.
	const isMelee = unitData[attacker.type].range[0] === 1
	const userPath = map.pathHistory
	const userEnd = userPath && userPath.length ? userPath[userPath.length - 1] : null
	const userPathUsable =
		isMelee &&
		userPath &&
		userPath.length >= 1 &&
		userPath[0] === tile &&
		userEnd !== null &&
		tilesAreAdjacent(map, userEnd, destination) &&
		(userEnd === tile || !map.layers.units[userEnd])

	const path = userPathUsable
		? userPath!.slice()
		: pathFinder(map, attacker, tile, destination, concealedEnemyTiles(map, attacker.team))
	const movementEndTile = path[path.length - 1] ?? tile

	if (path.length > 1) {
		// move() reads map.pathHistory to walk the exact route — make sure it sees
		// the path we just committed to, not a stale (or absent) history.
		map.pathHistory = path
		move({
			map,
			tile,
			choice: movementEndTile,
			callback: () => performAttack(map, movementEndTile, destination),
		})
	} else {
		map.pathHistory = []
		performAttack(map, movementEndTile, destination)
	}
}

const performAttack = (map: MapObject, attackerTile: number, targetTile: number) => {
	const attacker = map.layers.units[attackerTile]
	const target = map.layers.units[targetTile]
	if (!attacker || !target) return
	// The sequencer plays attack → (target bar / explosion) → counter → (attacker
	// bar / explosion), committing the authoritative result at the end.
	void animateAttackSequence(map, attackerTile, targetTile, (action) => commit(map, action))
}

const selectAttackTarget: Interactor = ({ map, tile }) => {
	const source = get(interactionSource)
	if (source === null) return
	const attacker = map.layers.units[source]
	if (!attacker) return

	// Only a highlighted target commits the strike — clicking anywhere else cancels
	// the attack prompt and frees the unit/selection, matching the land and build
	// flows. Previously this returned early WITHOUT resetting, leaving the red target
	// highlights painted and the state stuck on `selectAttackTarget`: every off-target
	// click was swallowed, so the player could neither attack nor click away — a hard
	// softlock until the turn ended.
	const valid = generateAttackList(map, source, attacker).includes(tile)

	interactionSource.set(null)
	interactionState.set('select')
	highlightActionsList(map, [])
	map.pathHistory = []

	if (!valid) return

	performAttack(map, source, tile)
}

// Stationary actions a unit can take without moving (everything except the
// move-derived attack and the always-present wait). When the player re-clicks a
// selected unit, the menu only pops if one of these is genuinely available — so
// plain combat units still deselect on a second click as before.
const IN_PLACE_ACTION_IDS = new Set<ActionMenuItemId>([
	'mine',
	'build',
	'repair',
	'transport',
	'ship_out',
	'air_lift',
	'land',
])

const maybeOpenInPlaceMenu = (map: MapObject, tile: number, unit: UnitObject) => {
	const items = computeAvailableActions({ map, tile, unit, moved: false })
	if (!items.some((item) => IN_PLACE_ACTION_IDS.has(item.id))) return
	openActionMenu(tile, unit.team, items, false)
}

// Pending directional build: which builder, for which team, and what it's making.
// Set by `beginBuildPlacement` (after the player picks a unit in the build menu)
// and consumed by the `selectBuildTile` interaction when they click a direction.
type PendingBuild = { builderTile: number; team: number; unitType: number }
let pendingBuild: PendingBuild | null = null

// Direction arrow (`route` segment state 3 = arrowhead) oriented from the builder
// toward each candidate tile. rotate: 0=E, 1=S, 2=W, 3=N (canvas rotates CW).
const buildArrowRotate = (map: MapObject, builderTile: number, tile: number): number => {
	if (tile === builderTile + 1) return 0
	if (tile === builderTile + map.cols) return 1
	if (tile === builderTile - 1) return 2
	return 3
}

const clearBuildPlacement = (map: MapObject) => {
	pendingBuild = null
	interactionState.set('select')
	highlightActionsList(map, [])
	map.route = []
	map.pathHistory = []
}

// Paint the cardinal-direction picker for a unit the player chose in the build
// menu: a green highlight + outward arrow on every adjacent tile the unit can
// legally stand on. Returns false (and does nothing) when there's nowhere valid
// to deploy, so the caller can tell the player instead of silently no-op'ing.
export const beginBuildPlacement = (
	map: MapObject,
	builderTile: number,
	team: number,
	unitType: number
): boolean => {
	const valid = buildableAdjacentTiles(map, builderTile, unitType)
	if (valid.length === 0) return false

	pendingBuild = { builderTile, team, unitType }
	interactionSource.set(builderTile)
	interactionState.set('selectBuildTile')
	highlightActionsList(
		map,
		valid.map((tile): TileHighlight => ({ tile, type: 0, tip: 0 }))
	)
	map.route = new Array(map.cols * map.rows)
	for (const tile of valid) {
		map.route[tile] = { state: 3, rotate: buildArrowRotate(map, builderTile, tile), index: 0 }
	}
	return true
}

const selectBuildTile: Interactor = ({ map, tile }) => {
	const pending = pendingBuild
	interactionSource.set(null)
	if (!pending) {
		clearBuildPlacement(map)
		return
	}

	const valid = buildableAdjacentTiles(map, pending.builderTile, pending.unitType)
	clearBuildPlacement(map)

	// Clicking anything that isn't a highlighted direction cancels the build and
	// frees the builder to act again (mirrors the attack-target / land flows).
	if (!valid.includes(tile)) return

	const result = buildAdjacent(map, pending.builderTile, pending.unitType, pending.team, tile)
	if (result.ok) {
		// Live human build mutates the board directly (not via applyAction), so fire
		// the build chime here — same as the factory build menu path.
		const sfx = sfxForAction('build')
		if (sfx) audioEngine.playSfx(sfx)
		return
	}
	if (result.reason === 'no-space') {
		addToast('No space to deploy unit', 'warn')
	}
}

// Forfeit the match for `team`. Routed through `commit` like any other action so
// it applies locally (and fires its match-end flow) and relays to an online
// opponent. Safe in single-player too — the local interactor just applies it.
export const surrender = (map: MapObject, team: number): void => {
	commit(map, { kind: 'surrender', team })
}

const hud: Interactor = () => {}

const actionsDecision = {
	select,
	choice,
	preview,
	move,
	attack,
	selectAttackTarget,
	selectBuildTile,
	hud,
} as const

const actionType = [move, attack] as const

export const performMenuAction = (map: MapObject, actionId: ActionMenuItemId): void => {
	const menu = get(actionMenuState)
	if (!menu.open || menu.unitTile === null) return
	const tile = menu.unitTile
	const unit = map.layers.units[tile]
	if (!unit) {
		closeActionMenu()
		return
	}

	switch (actionId) {
		case 'wait': {
			closeActionMenu()
			commit(map, { kind: 'wait', tile })
			return
		}
		case 'attack': {
			closeActionMenu()
			interactionSource.set(tile)
			interactionState.set('selectAttackTarget')
			const targets = generateAttackList(map, tile, unit)
			highlightActionsList(
				map,
				targets.map((t): TileHighlight => ({ tile: t, type: 1, tip: 1 }))
			)
			return
		}
		case 'mine': {
			closeActionMenu()
			commit(map, { kind: 'mine', tile })
			return
		}
		case 'build': {
			closeActionMenu()
			openBuildMenu(tile, unit.team, 'builder')
			return
		}
		case 'repair': {
			closeActionMenu()
			// Snapshot health before the heal so the bar can ease up to its new value
			// (same ease-out the combat bars use) rather than snapping.
			const before = unit.health ?? unitData[unit.type]?.health ?? 0
			commit(map, { kind: 'repair', tile })
			const healed = map.layers.units[tile]
			if (healed === unit) {
				void animateHealthBar(unit, before, unit.health ?? before)
			}
			return
		}
		case 'transport': {
			closeActionMenu()
			const transports = findFriendlyTransporters(map, tile, unit.team)
			const transport = transports[0]
			if (typeof transport !== 'number') return
			commit(map, { kind: 'transport-load', transport, passenger: tile })
			return
		}
		case 'ship_out': {
			closeActionMenu()
			// A unit that ships out *without* moving keeps its turn: the fresh Leviathan
			// can still sail this turn, so we don't end it. The transform happens in
			// place, so the new unit inherits the tile's acted state — already set if the
			// unit reached here by moving (post-move menu), still clear if it didn't.
			const result = shipOut(map, tile)
			if (result.ok) {
				applyWinConditions(map)
			}
			return
		}
		case 'air_lift': {
			closeActionMenu()
			// Same rule as ship_out: a commando that paraglides without moving may still
			// fly the new Transporter this turn. In-place transform inherits the tile's
			// acted state, so there's nothing to mark.
			const result = airLift(map, tile)
			if (result.ok) {
				applyWinConditions(map)
			}
			return
		}
		case 'land': {
			closeActionMenu()
			// Paragliders and sea transports always disembark onto their own tile — there's
			// no destination to choose, so commit the unload straight away. landUnload
			// re-checks that the tile is a legal drop for the carried unit.
			commit(map, { kind: 'transport-unload', transport: tile, tile })
			return
		}
	}
}

// Dismiss the post-move menu to "peek" at the board. The unit has already moved
// (the move committed before the menu opened), but we deliberately do NOT resolve
// it as a wait — the player is just looking around, and a tap re-summons the menu
// (see `reopenMenuFromPeek`) so they can still attack/capture/etc. This replaces
// the old "closing the menu silently waits the unit", which destroyed the choice.
export const peekMenu = (): void => {
	peekActionMenu()
}

// A tap while peeking brings the menu back for the same unit. Items are recomputed
// from the live board (cheap, and robust if anything shifted) and the menu reopens
// anchored to the unit again. Returns whether a peek was actually pending — the
// caller (the board's click handler) uses that to decide between re-summoning the
// menu and running a normal tile selection.
export const reopenMenuFromPeek = (map: MapObject): boolean => {
	const menu = get(actionMenuState)
	if (!menu.peeking || menu.unitTile === null) return false
	const tile = menu.unitTile
	const unit = map.layers.units[tile]
	if (!unit) {
		closeActionMenu()
		return false
	}
	openActionMenu(tile, unit.team, computeAvailableActions({ map, tile, unit, moved: true }))
	return true
}

// Act-in-place (double-click): open a unit's action menu anchored to where it
// already stands, WITHOUT moving it first. Mirrors the post-move menu but with
// `moved: false`, so a stationary attack (including indirect fire, which forfeits
// its shot after moving), capture, build, etc. are all offered from the unit's
// current tile. Any in-progress selection highlight is cleared first.
//
// Returns false — so the caller leaves the unit selected for a normal move —
// unless the unit has a genuine stationary action to offer. Opening a menu whose
// only entry is `wait` (a plain unit with nowhere to capture/build/repair) is
// worse than useless: its full-screen backdrop swallows the player's next click,
// so they can't pick a move destination and the unit appears soft-locked on its
// tile. This bites hardest on a unit standing on its own Warfactory, the very
// case the player most wants to move off of.
export const openInPlaceMenu = (map: MapObject, tile: number): boolean => {
	const unit = map.layers.units[tile]
	if (!unit) return false
	if (!canSelectUnit(unit, tile)) return false
	const items = computeAvailableActions({ map, tile, unit, moved: false })
	if (!items.some((item) => IN_PLACE_ACTION_IDS.has(item.id))) return false
	interactionSource.set(null)
	interactionState.set('select')
	highlightActionsList(map, [])
	map.route = []
	map.pathHistory = []
	openActionMenu(tile, unit.team, items, false)
	return true
}

// Cancel an in-place (not-yet-moved) action menu: close the panel and drop the
// selection entirely. Because nothing was committed, the unit is NOT idled — it
// stays free to act again this turn. The in-place menu always opens from a clean
// `select` state with no highlights/route, so closing the menu is all that's
// needed to fully deselect. (Contrast `peekMenu`, which keeps a moved unit's
// pending choice alive.)
export const cancelMenu = (): void => {
	closeActionMenu()
}

// Wipe every transient interaction + menu state. Called on each turn handoff so a
// selection, open/peeked menu, or stale move-highlight from the previous turn
// never bleeds into the next one. Without this, ending a turn mid-selection left
// `interactionState` stuck on `choice`/`preview` with a stale `interactionSource`,
// so the next turn's first board clicks were routed as moves/attacks for a unit
// the player wasn't pointing at — the board showed leftover green move tiles that
// couldn't actually be commanded.
export const resetInteraction = (map: MapObject): void => {
	interactionSource.set(null)
	interactionState.set('select')
	highlightActionsList(map, [])
	map.route = []
	map.pathHistory = []
	closeActionMenu()
	closeBuildMenu()
}
