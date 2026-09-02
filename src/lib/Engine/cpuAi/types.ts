import type { SerializedAction } from '../Interactor/serializedAction'

export type ActionPlan = {
	unitTile: number
	actions: SerializedAction[]
	score: number
	kind:
		| 'attack'
		| 'capture'
		| 'mine'
		| 'repair'
		| 'wait'
		| 'build'
		// Transport plans (see .claude/ai-search-depth.md section 8): a loaded carrier
		// flying to a tile and dropping its passenger, a commando lifting into a
		// Transporter (usually lift → fly → land in one plan), a ground unit embarking
		// on a Port, and a commando boarding an existing empty Transporter.
		| 'land'
		| 'air-lift'
		| 'ship-out'
		| 'load'
}

export type AiCtx = {
	map: MapObject
	cpuTeam: number
}
