import { writable } from 'svelte/store'

type InterationState =
	| 'select'
	| 'choice'
	| 'preview'
	| 'hud'
	| 'selectAttackTarget'
	| 'selectBuildTile'

export const interactionState = writable<InterationState>('select')

export const interactionSource = writable<number | null>(null)
