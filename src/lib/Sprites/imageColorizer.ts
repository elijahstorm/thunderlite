export const imageColorizer = () => {
	const canvas = document.createElement('canvas')
	const ctx = canvas.getContext('2d', {
		willReadFrequently: true,
	})
	if (!ctx) return () => (originalImage: HTMLImageElement) => originalImage

	return (team: number) => {
		if (team === 0) return (originalImage: HTMLImageElement) => originalImage

		return (originalImage: HTMLImageElement) => {
			canvas.width = originalImage.width
			canvas.height = originalImage.height
			ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height)

			const [source, dest] = [colorData[0], colorData[team]]

			const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
			const hardness = 50

			for (let i = 0; i < imgData.data.length; i += 4) {
				if (imgData.data[i + 3] < hardness) continue

				for (let j = 0; j < dest.length; j++) {
					const r = imgData.data[i] - source[j][0]
					const g = imgData.data[i + 1] - source[j][1]
					const b = imgData.data[i + 2] - source[j][2]

					if (Math.abs(r) < hardness && Math.abs(g) < hardness && Math.abs(b) < hardness) {
						imgData.data[i] = Math.max(0, Math.min(255, dest[j][0] - r))
						imgData.data[i + 1] = Math.max(0, Math.min(255, dest[j][1] - g))
						imgData.data[i + 2] = Math.max(0, Math.min(255, dest[j][2] - b))
					}
				}
			}

			ctx.putImageData(imgData, 0, 0)
			const output = new Image()
			output.src = canvas.toDataURL('image/png')
			return output
		}
	}
}

// light to dark
const colorData = [
	[
		[255, 144, 133], // red
		[233, 56, 46],
		[170, 22, 44],
		[102, 26, 94],
		[129, 25, 75],
	],
	[
		[169, 207, 255], // blue
		[69, 164, 225],
		[43, 95, 199],
		[61, 49, 127],
		[25, 62, 127],
	],
	[
		[142, 255, 152], // green
		[59, 255, 20],
		[67, 193, 56],
		[22, 145, 15],
		[25, 127, 75],
	],
	[
		[255, 255, 142], // yellow
		[229, 229, 43],
		[206, 109, 28],
		[125, 137, 13],
		[127, 119, 25],
	],
	[
		[200, 208, 204], // grey
		[180, 186, 185],
		[138, 134, 139],
		[80, 81, 99],
		[60, 25, 75],
	],
]
