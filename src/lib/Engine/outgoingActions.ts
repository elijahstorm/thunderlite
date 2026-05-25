import { writable } from 'svelte/store'
import type { SerializedAction } from './Interactor/serializedAction'

export const outgoingActions = writable<SerializedAction | null>(null)

export const emitOutgoingAction = (action: SerializedAction): void => {
	outgoingActions.set(action)
}
