import { get } from 'svelte/store'
import { spriteStore } from './spriteStore'
import type { imageColorizer } from './imageColorizer'
import type { createImageLoader } from './images'

export const imageLazyLoader =
	<T extends ObjectAssetMeta>(imageContainer: keyof MapLayers, dataList: T[], teamAmount = 1) =>
	(makeImage: ReturnType<typeof createImageLoader>, colorizer: typeof imageColorizer) =>
	(includedTypes: number[]) =>
		Object.entries(
			dataList.reduce(
				(carry, currentValue, index) => {
					carry[index] = currentValue
					return carry
				},
				{} as { [key: number]: T }
			)
		)
			.filter((_, index) => includedTypes.indexOf(index) !== -1)
			.reduce(
				(carry, [_index, data]) => {
					const renderer = {
						frames: data.frames,
						xOffset: data.xOffset,
						yOffset: data.yOffset,
					} as ObjectSpriteRenderer
					const index = parseInt(_index)
					const cache = get(spriteStore)[imageContainer][index]

					if (cache) {
						renderer.sprite = cache
					} else {
						renderer.sprite = new Array(teamAmount)
						for (let team = 0; team < teamAmount; team++) {
							makeImage(data.url)((image) => {
								spriteStore.update((sprites) => {
									if (!sprites[imageContainer][index]) {
										sprites[imageContainer][index] = new Array(teamAmount)
									}
									sprites[imageContainer][index][team] = colorizer(team)(image)
									return sprites
								})
								renderer.sprite[team] = colorizer(team)(image)
							})
						}
					}

					carry[index] = renderer
					return carry
				},
				{} as { [key: number]: ObjectSpriteRenderer }
			)
