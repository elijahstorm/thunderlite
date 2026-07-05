import { animateRoute } from './Animator/animator'
import { animateAttackSequence } from './attackSequence'
import { applyAction } from './applyAction'
import { dispatchSerializedAction, type SerializedAction } from './Interactor/serializedAction'
import { pathFinder } from './Interactor/Pathing/pathFinder'
import { playActionSfx } from '$lib/Audio/playActionSfx'
import { recordStealthPassthrough } from './cpuAi/stealthMemory'

// Play the same move/attack choreography a local or CPU action plays — the unit
// slides its route, an attack swings and explodes — for an action that arrived
// from a remote opponent over the network, then commit the authoritative state.
//
// Unlike the interactor/CPU paths this NEVER re-emits the action: it came from the
// shared event log, so it applies via `applyAction` (with live SFX) rather than a
// `commit` that would relay it back to the server. Only `move`/`attack` have any
// choreography; every other kind applies instantly via the existing silent path,
// exactly as before this feature.
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
		// The event carries only from/to (the sender already truncated at any
		// ambush it hit), so rebuild a walkable route between them purely for the
		// slide. If we can't (state drift, our fog belief differs), fall back to an
		// instant apply so the game never stalls.
		const route = pathFinder(map, unit, action.from, action.to)
		if (route.length < 2) {
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
		return
	}

	if (action.kind === 'attack') {
		await animateAttackSequence(map, action.from, action.to, (a, opts) =>
			applyAction(map, a, { live: true, ...opts })
		)
		return
	}

	// Captures, builds, mines, repairs, transport, wait, end-turn, surrender: no
	// slide to play — apply instantly, unchanged from before.
	dispatchSerializedAction(map, action)
}
