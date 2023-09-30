import { get } from 'svelte/store'
import { spriteStore } from './spriteStore'

export const imageLazyLoader =
	<T extends SpriteObject>(imageContainer: keyof MapLayers, dataList: T[]) =>
	(makeImage: (src: string) => (signalLoaded: (image: HTMLImageElement) => void) => void) =>
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
					const cache = get(spriteStore)[imageContainer][index]

					if (cache) {
						data.sprite = cache
					} else {
						makeImage(data.url)((image) => {
							spriteStore.update((sprites) => {
								sprites[imageContainer][index] = image
								return sprites
							})
							data.sprite = image
						})
					}

					carry[index] = data
					return carry
				},
				{} as { [key: number]: T }
			)
