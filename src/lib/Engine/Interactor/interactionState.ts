import { writable } from 'svelte/store'

type InterationState = 'select' | 'choice' | 'hud'

export const interactionState = writable<InterationState>('select')

export const interactionChoice = writable<number | undefined>()
