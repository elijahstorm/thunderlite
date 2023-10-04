export const createImageLoader = (finished: (finished: boolean) => void) => {
	const [startLoad, loaded] = ((finished) => {
		let images = 0
		let loadedCount = 0
		const isFinished = (action: VoidFunction) => {
			action()
			finished(loadedCount === images)
		}

		return [
			() => isFinished(() => images++),
			(signalLoaded: VoidFunction) => () =>
				isFinished(() => {
					loadedCount++
					signalLoaded()
				}),
		]
	})(finished)

	return (url: string) => (signalLoaded: (image: HTMLImageElement) => void) => {
		startLoad()
		fetch(url)
			.then((response) => response.blob())
			.then((blob) => {
				const image = new Image()
				image.src = URL.createObjectURL(blob)
				image.onload = loaded(() => signalLoaded(image))
			})
			.catch((error) => {
				console.error('Error fetching image:', error)
			})
	}
}
