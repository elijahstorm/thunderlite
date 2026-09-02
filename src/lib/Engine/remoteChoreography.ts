import type { SerializedAction } from './Interactor/serializedAction'
import {
	ANIMATION_TIME,
	BLOCKED_ANIMATION_TIME,
	HEALTH_BAR_ANIMATION_TIME,
	OVERLAY_ANIMATION_TIME,
} from './Animator/timings'

/**
 * Which action kinds `animateRemoteAction` actually has choreography for.
 * Everything else it applies instantly.
 *
 * This lives in its own leaf module (type-only imports, no animator, no audio) so
 * every caller that gates on animation can ask the same question. They used to
 * each keep their own `move || attack` check — the socket event queue and the
 * replay viewer both did — which is why a repair still teleported for the
 * watching player even though `animateRemoteAction` had an animation for it: the
 * queue decided it wasn't animatable and never called in. Add a kind here and to
 * `animateRemoteAction` together; nowhere else.
 */
export const hasRemoteChoreography = (action: SerializedAction): boolean =>
	action.kind === 'move' ||
	action.kind === 'attack' ||
	action.kind === 'repair' ||
	// A wait only has something to show when it stands for a move that ran into a
	// concealed enemy on its first step (the blocked lunge); a plain wait is silent.
	(action.kind === 'wait' && action.blocked !== undefined)

/**
 * Frames in a combat overlay sheet, for estimating an attack's length. The real
 * count comes from the sprite tables, which this module deliberately cannot see;
 * the sheets run 8-14 frames, so the middle of that range is close enough for a
 * decision about pacing.
 */
const TYPICAL_OVERLAY_FRAMES = 11

/**
 * Roughly how long `animateRemoteAction` will spend on this action.
 *
 * Used to decide whether a queued backlog is watchable or has to be
 * fast-forwarded, so it only has to be right to within a rough factor — and it
 * has to be cheap and pure, since it is asked once per queued event. It is
 * deliberately derived from the real animation beats rather than a guessed
 * constant, so retuning the animator retunes this with it.
 *
 * A move's length is known exactly when the event carries the sender's route
 * (which is the whole reason the route is relayed — see `animateRemoteAction`).
 * Without one, the animator pathfinds and we assume a short hop.
 */
export const remoteChoreographyMs = (action: SerializedAction): number => {
	switch (action.kind) {
		case 'move': {
			const tiles = Array.isArray(action.path) ? action.path.length - 1 : 2
			// A cut-short walk ends on the blocked lunge + callout.
			const blocked = action.blocked !== undefined ? BLOCKED_ANIMATION_TIME : 0
			return Math.max(1, tiles) * ANIMATION_TIME + blocked
		}
		case 'wait':
			return action.blocked !== undefined ? BLOCKED_ANIMATION_TIME : 0
		case 'attack':
			// Swing, then the health-bar ease, then — often — the target's return fire
			// and its own ease. Counted as one exchange plus most of a second.
			return OVERLAY_ANIMATION_TIME * TYPICAL_OVERLAY_FRAMES * 2 + HEALTH_BAR_ANIMATION_TIME * 2
		case 'repair':
			return HEALTH_BAR_ANIMATION_TIME
		default:
			return 0
	}
}
