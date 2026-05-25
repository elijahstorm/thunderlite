import { writable } from 'svelte/store'

export type BuildMenuMode = 'building' | 'builder'

export type BuildMenuState = {
	open: boolean
	buildingTile: number | null
	team: number | null
	mode: BuildMenuMode
}

const closed = (): BuildMenuState => ({
	open: false,
	buildingTile: null,
	team: null,
	mode: 'building',
})

export const buildMenuState = writable<BuildMenuState>(closed())

export const openBuildMenu = (
	buildingTile: number,
	team: number,
	mode: BuildMenuMode = 'building'
): void => {
	buildMenuState.set({ open: true, buildingTile, team, mode })
}

export const closeBuildMenu = (): void => {
	buildMenuState.set(closed())
}
