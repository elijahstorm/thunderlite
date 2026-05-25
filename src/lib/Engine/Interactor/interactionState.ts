import { writable } from 'svelte/store'

type InterationState =
	| 'select'
	| 'choice'
	| 'hud'
	| 'selectAttackTarget'
	| 'selectLandTile'

export const interactionState = writable<InterationState>('select')

export const interactionSource = writable<number | null>(null)
