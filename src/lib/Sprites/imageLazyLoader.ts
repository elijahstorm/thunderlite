import { get } from 'svelte/store'
import { spriteStore } from './spriteStore'
import type { imageColorizer } from './imageColorizer'
import type { createImageLoader } from './images'

export const imageLazyLoader =
	<T extends ObjectAssetMeta>(imageContainer: keyof MapLayers, dataList: T[], teamAmount = 1) =>
	(makeImage: ReturnType<typeof createImageLoader>, colorizer: ReturnType<typeof imageColorizer>) =>
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
					const index = parseInt(_index)
					const renderer = {
						frames: data.frames,
						xOffset: data.xOffset,
						yOffset: data.yOffset,
					} as ObjectSpriteRenderer
					const cache = get(spriteStore)[imageContainer][index]

					if (cache) {
						renderer.sprite = cache
					} else {
						makeImage(data.url)((image) => {
							renderer.sprite = Array.from({ length: teamAmount }, (_, team) =>
								colorizer(team)(image)
							)
							spriteStore.update((sprites) => {
								sprites[imageContainer][index] = renderer.sprite
								return sprites
							})
						})
					}

					carry[index] = renderer
					return carry
				},
				{} as { [key: number]: ObjectSpriteRenderer }
			)
