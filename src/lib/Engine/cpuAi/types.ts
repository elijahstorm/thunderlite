import type { SerializedAction } from '../Interactor/serializedAction'

export type ActionPlan = {
	unitTile: number
	actions: SerializedAction[]
	score: number
	kind: 'attack' | 'capture' | 'mine' | 'repair' | 'wait'
}

export type AiCtx = {
	map: MapObject
	cpuTeam: number
}
