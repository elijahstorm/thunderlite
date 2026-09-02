import { get } from 'svelte/store'
import { animateRoute, animateHealthBar, animateBlocked } from './Animator/animator'
import { animateAttackSequence } from './attackSequence'
import { applyAction } from './applyAction'
import { dispatchSerializedAction, type SerializedAction } from './Interactor/serializedAction'
import { pathFinder } from './Interactor/Pathing/pathFinder'
import { playActionSfx } from '$lib/Audio/playActionSfx'
import { recordStealthPassthrough } from './cpuAi/stealthMemory'
import { viewerVisibility } from './fogState'
import { unitSeenByViewer } from './visibility'

/**
 * Is `route` a chain of orthogonally adjacent, in-bounds tiles from `from` to
 * `to` on THIS board? The relayed route is only choreography, but it arrives from
 * another client (over a shape the server can't fully check — it has no board), so
 * a route that doesn't physically join up is discarded in favour of pathfinding
 * rather than slid across the map in impossible jumps.
 */
const isWalkableChain = (map: MapObject, route: number[], from: number, to: number): boolean => {
	const size = map.cols * map.rows
	if (route.length < 2) return false
	if (route[0] !== from || route[route.length - 1] !== to) return false
	for (let i = 0; i < route.length; i++) {
		const tile = route[i]
		if (tile < 0 || tile >= size) return false
		if (i === 0) continue
		const prev = route[i - 1]
		const dx = Math.abs((tile % map.cols) - (prev % map.cols))
		const dy = Math.abs(Math.floor(tile / map.cols) - Math.floor(prev / map.cols))
		if (dx + dy !== 1) return false
	}
	return true
}

// Play the same move/attack choreography a local or CPU action plays — the unit
// slides its route, an attack swings and explodes — for an action that arrived
// from a remote opponent over the network, then commit the authoritative state.
//
// Unlike the interactor/CPU paths this NEVER re-emits the action: it came from the
// shared event log, so it applies via `applyAction` (with live SFX) rather than a
// `commit` that would relay it back to the server. Only the kinds listed in
// `hasRemoteChoreography` have anything to play; every other kind applies
// instantly via the existing silent path.
export const animateRemoteAction = async (
	map: MapObject,
	action: SerializedAction
): Promise<void> => {
	if (action.kind === 'move') {
		const unit = map.layers.units[action.from]
		// The board drifted from what the event assumes (or it's a no-op move) —
		// there's nothing coherent to slide, so just apply the state.
		if (!unit || action.from === action.to) {
			dispatchSerializedAction(map, action)
			return
		}
		// Walk the route the SENDER walked when the event carries it. Rebuilding one
		// from from/to alone is what made the two boards disagree: `pathFinder`
		// returns whichever equal-cost line it settles first, so a route the player
		// steered right-then-up around a suspected ambush replayed here as
		// up-then-right, straight over the ground they had avoided. The relayed route
		// is only trusted when it physically joins up on this board; otherwise (a
		// legacy event with no path, or one that doesn't hold up) we pathfind as
		// before. If even that fails, apply instantly so the game never stalls.
		const relayed = action.path
		const route =
			relayed && isWalkableChain(map, relayed, action.from, action.to)
				? relayed
				: pathFinder(map, unit, action.from, action.to)
		if (route.length < 2) {
			dispatchSerializedAction(map, action)
			return
		}
		// Fog: don't play the slide for a unit the local viewer can't see — an enemy
		// stepping entirely through our fog would otherwise flash its sprite across
		// tiles we have no vision of. If neither endpoint is visible, apply the move
		// instantly (it renders only where the fog mask allows, e.g. its destination).
		const fog = get(viewerVisibility)
		const seen = unitSeenByViewer(fog, action.from, unit) || unitSeenByViewer(fog, action.to, unit)
		if (!seen) {
			dispatchSerializedAction(map, action)
			return
		}
		// Lift the unit off its source tile so the canvas doesn't draw it there
		// under the moving overlay (mirrors the interactor/CPU move path).
		map.layers.units[action.from] = null
		// Footsteps roll *with* the walk; the commit below suppresses 'move' so the
		// sound isn't heard twice.
		playActionSfx('move', unit)
		try {
			await animateRoute(map, unit, action.from, action.to, route)
		} finally {
			map.layers.units[action.from] = unit
		}
		// A cloaked unit caught crossing our radar mid-route is logged so we
		// "remember" a stealth threat is about, same as the local/CPU paths.
		recordStealthPassthrough(map, route, unit)
		applyAction(map, action, { live: true, suppressSfxActions: ['move'] })
		// The walk was cut short by a unit the mover couldn't see — very often OURS.
		// Play the lunge at the tile it hit, or from this side the enemy just walked
		// up to our hidden unit and inexplicably stopped. Awaited so the queue can't
		// start the opponent's next action while the callout is still up.
		if (action.blocked !== undefined) {
			await animateBlocked(map, unit, action.to, action.blocked)
		}
		return
	}

	// A move that never got off its tile: the first step ran into a concealed
	// enemy, so the unit forfeited in place. Same lunge as a cut-short move, from
	// where it stands — but only if we can see it there; otherwise apply silently.
	if (action.kind === 'wait' && action.blocked !== undefined) {
		const unit = map.layers.units[action.tile]
		applyAction(map, action, { live: true })
		if (unit && unitSeenByViewer(get(viewerVisibility), action.tile, unit)) {
			await animateBlocked(map, unit, action.tile, action.blocked)
		}
		return
	}

	if (action.kind === 'attack') {
		await animateAttackSequence(map, action.from, action.to, (a, opts) =>
			applyAction(map, a, { live: true, ...opts })
		)
		return
	}

	// Repair heals HP — mirror the local path's health-bar rise instead of
	// snapping the bar to full on the observer's screen. Awaited (unlike the local
	// path, where the player is free to keep clicking through their own ease): the
	// queue behind this event would otherwise apply the opponent's next action mid
	// rise, and a heal that gets overwritten before it finishes reads as the snap
	// this exists to remove.
	if (action.kind === 'repair') {
		const unit = map.layers.units[action.tile]
		if (!unit) {
			applyAction(map, action, { live: true })
			return
		}
		const before = unit.health ?? 0
		applyAction(map, action, { live: true })
		const after = unit.health ?? before
		await animateHealthBar(unit, before, after)
		return
	}

	// Captures, builds, mines, transport, wait, end-turn, surrender: no slide to
	// play, but apply them LIVE so the acting player's stats (turns taken,
	// captures, units built) are counted on this client too — otherwise the
	// results screen shows the opponent's turns/captures as 0. (Only live network
	// pushes reach here; reconnect backfill still applies silently, so nothing
	// double-counts.)
	applyAction(map, action, { live: true })
}
