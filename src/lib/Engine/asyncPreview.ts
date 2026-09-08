import { deriveFromHash } from '$lib/Map/Editor/mapExporter'
import { initGameStateFromMap, resetGameState } from './gameState'
import { dispatchSerializedAction, type SerializedAction } from './Interactor/serializedAction'
import { computeTeamVisibility } from './visibility'

export interface AsyncPreviewSnapshot {
	cols: number
	rows: number
	ground: { type: number }[]
	units: ({ type: number; team: number; health?: number; hidden?: boolean } | null)[]
	buildings: ({ type: number; team: number } | null)[]
	visible: Set<number>
}

// Folding a log briefly drives the same engine singletons live play uses
// (`gameState`, fog/smoke), so two previews folding at once would stomp each
// other. Every await in `buildAsyncPreview` happens before this runs, so this
// queue only matters if that ever stops being true — cheap insurance against
// a subtle cross-game visual bug.
let queue: Promise<unknown> = Promise.resolve()
const serialized = <T>(fn: () => T): Promise<T> => {
	const run = queue.then(fn)
	queue = run.then(
		() => undefined,
		() => undefined
	)
	return run
}

/**
 * Rebuild a session's current board from its map hash and action log, purely
 * to read off terrain/unit/building state for a static list-item preview —
 * no HUD, no interactor, no CPU, no animation. `resetGameState` afterwards
 * leaves nothing behind for the next board (live play or another preview) to
 * trip over.
 */
export const buildAsyncPreview = (
	mapHash: string,
	actions: SerializedAction[],
	localTeam: number
): Promise<AsyncPreviewSnapshot> =>
	serialized(() => {
		const map = deriveFromHash(mapHash)
		initGameStateFromMap(map)
		try {
			for (const action of actions) {
				// A preview is best-effort: one action the reconstructed board can't
				// apply shouldn't blank out the whole thumbnail.
				try {
					dispatchSerializedAction(map, action)
				} catch {
					// skip
				}
			}
			return {
				cols: map.cols,
				rows: map.rows,
				ground: map.layers.ground.map((g) => ({ type: g.type })),
				units: map.layers.units.map((u) =>
					u ? { type: u.type, team: u.team, health: u.health, hidden: u.hidden } : null
				),
				buildings: map.layers.buildings.map((b) => (b ? { type: b.type, team: b.team } : null)),
				visible: computeTeamVisibility(map, localTeam),
			}
		} finally {
			resetGameState()
		}
	})
