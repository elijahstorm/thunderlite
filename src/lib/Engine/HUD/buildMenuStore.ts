import { writable } from 'svelte/store'

export type BuildMenuState = {
	open: boolean
	buildingTile: number | null
	team: number | null
}

export const buildMenuState = writable<BuildMenuState>({
	open: false,
	buildingTile: null,
	team: null,
})

export const openBuildMenu = (buildingTile: number, team: number): void => {
	buildMenuState.set({ open: true, buildingTile, team })
}

export const closeBuildMenu = (): void => {
	buildMenuState.set({ open: false, buildingTile: null, team: null })
}
