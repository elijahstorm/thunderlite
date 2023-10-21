import { writable } from 'svelte/store'

type ContainedSpriteStore = {
	[key: number]: HTMLImageElement[]
}
type ContainedLoadedSprites = {
	[key: number]: ObjectSpriteRenderer
}

export const spriteStore = writable<{
	ground: ContainedSpriteStore
	sky: ContainedSpriteStore
	units: ContainedSpriteStore
	buildings: ContainedSpriteStore
}>({
	ground: {},
	sky: {},
	units: {},
	buildings: {},
})

export const rendererStore = writable<{
	ground: ContainedLoadedSprites
	sky: ContainedLoadedSprites
	units: ContainedLoadedSprites
	buildings: ContainedLoadedSprites
}>({
	ground: {},
	sky: {},
	units: {},
	buildings: {},
})
