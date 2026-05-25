import { writable } from 'svelte/store'

export type WarmachineActionsState = {
	open: boolean
	tile: number | null
	team: number | null
	canMine: boolean
	canBuild: boolean
}

const initial = (): WarmachineActionsState => ({
	open: false,
	tile: null,
	team: null,
	canMine: false,
	canBuild: false,
})

export const warmachineActionsStore = writable<WarmachineActionsState>(initial())

export const openWarmachineActions = (
	tile: number,
	team: number,
	flags: { canMine: boolean; canBuild: boolean }
): void => {
	warmachineActionsStore.set({
		open: true,
		tile,
		team,
		canMine: flags.canMine,
		canBuild: flags.canBuild,
	})
}

export const closeWarmachineActions = (): void => {
	warmachineActionsStore.set(initial())
}
