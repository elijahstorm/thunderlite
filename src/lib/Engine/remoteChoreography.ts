import type { SerializedAction } from './Interactor/serializedAction'

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
	action.kind === 'move' || action.kind === 'attack' || action.kind === 'repair'
