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
	attacks: ContainedSpriteStore
	buildings: ContainedSpriteStore
	animation: ContainedSpriteStore
}>({
	ground: {},
	sky: {},
	units: {},
	attacks: {},
	buildings: {},
	animation: {},
})

export const rendererStore = writable<{
	ground: ContainedLoadedSprites
	sky: ContainedLoadedSprites
	units: ContainedLoadedSprites
	attacks: ContainedLoadedSprites
	buildings: ContainedLoadedSprites
	animation: ContainedLoadedSprites
}>({
	ground: {},
	sky: {},
	units: {},
	attacks: {},
	buildings: {},
	animation: {},
})
