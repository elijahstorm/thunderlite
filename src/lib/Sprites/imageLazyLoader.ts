import { get } from 'svelte/store'
import { spriteStore } from './spriteStore'
import { imageColorizer } from './imageColorizer'

export const imageLazyLoader =
	<T extends SpriteObject>(imageContainer: keyof MapLayers, dataList: T[], teamAmount = 1) =>
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
						data.sprite = new Array(teamAmount)
						for (let team = 0; team < teamAmount; team++) {
							makeImage(data.url)((image) => {
								spriteStore.update((sprites) => {
									if (!sprites[imageContainer][index]) {
										sprites[imageContainer][index] = new Array(teamAmount)
									}
									sprites[imageContainer][index][team] = imageColorizer(team)(image)
									return sprites
								})
								data.sprite[team] = imageColorizer(team)(image)
							})
						}
					}

					carry[index] = data
					return carry
				},
				{} as { [key: number]: T }
			)
