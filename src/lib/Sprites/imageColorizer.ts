export const imageColorizer = (team: number) => (originalImage: HTMLImageElement) => {
	const canvas = document.createElement('canvas')
	const ctx = canvas.getContext('2d')

	if (!ctx) {
		return originalImage
	}

	canvas.width = originalImage.width
	canvas.height = originalImage.height
	ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height)

	const [source, dest] = [colorData[0], colorData[team]]

	const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
	const hardness = 50

	for (let i = 0; i < imgData.data.length; i += 4) {
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

export const promiseColorized = (team: number) => async (src: string) =>
	new Promise<string>((resolve, reject) => {
		const originalImage = new Image()
		originalImage.src = src
		originalImage.onload = () => {
			const canvas = document.createElement('canvas')
			const ctx = canvas.getContext('2d')

			if (!ctx) {
				reject('could not load canvas')
				return
			}

			canvas.width = originalImage.width
			canvas.height = originalImage.height
			ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height)

			const [source, dest] = [colorData[0], colorData[team]]

			const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
			const hardness = 50

			for (let i = 0; i < imgData.data.length; i += 4) {
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
			resolve(canvas.toDataURL('image/png'))
		}
	})

const colorData = [
	// light to dark
	[
		[255, 144, 133],
		[233, 56, 46],
		[170, 22, 44],
		[102, 26, 94],
		[129, 25, 75],
	], // red
	[
		[169, 207, 255],
		[69, 164, 225],
		[43, 95, 199],
		[61, 49, 127],
		[25, 62, 127],
	], // blue
	[
		[142, 255, 152],
		[59, 255, 20],
		[67, 193, 56],
		[22, 145, 15],
		[25, 127, 75],
	], // green
	[
		[255, 255, 142],
		[229, 229, 43],
		[206, 109, 28],
		[125, 137, 13],
		[127, 119, 25],
	], // yellow
	[
		[200, 208, 204],
		[180, 186, 185],
		[138, 134, 139],
		[80, 81, 99],
		[60, 25, 75],
	], // grey
]
