/* eslint-disable @typescript-eslint/ban-ts-comment */
import { get } from 'svelte/store'
import { spriteStore } from './spriteStore'

export const imageLazyLoader =
	<T>(imageContainer: keyof MapLayers, dataList: T[]) =>
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
						// @ts-ignore
						data.sprite = cache
					} else {
						// @ts-ignore
						makeImage(data.sprite)((image) => {
							spriteStore.update((sprites) => {
								sprites[imageContainer][index] = image
								return sprites
							})
							// @ts-ignore
							data.sprite = image
						})
					}
					carry[index] = data
					return carry
				},
				{} as { [key: number]: T }
			)
