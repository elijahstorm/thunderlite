import { writable } from 'svelte/store'

type ContainedSpriteStore = {
	[key: number]: HTMLImageElement
}
type ContainedLoadedSprites = {
	[key: number]: ObjectSpecificRenderer
}

export const spriteStore = writable<{
	ground: ContainedSpriteStore
	units: ContainedSpriteStore
	sky: ContainedSpriteStore
}>({
	ground: {},
	units: {},
	sky: {},
})

export const rendererStore = writable<{
	ground: ContainedLoadedSprites
	units: ContainedLoadedSprites
	sky: ContainedLoadedSprites
}>({
	ground: {},
	units: {},
	sky: {},
})
