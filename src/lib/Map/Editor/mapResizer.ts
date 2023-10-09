export const deepClone = <T>(obj: T): T => {
	if (Array.isArray(obj)) {
		const clonedArray = [] as T
		for (const key in obj) {
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			clonedArray[key] = deepClone(obj[key])
		}
		return clonedArray
	}

	if (obj !== null && typeof obj === 'object') {
		const clonedObj = {} as T
		for (const key in obj) {
			if (Object.hasOwnProperty.call(obj, key)) {
				clonedObj[key] = deepClone((obj as typeof clonedObj)[key])
			}
		}
		return clonedObj
	}

	return obj
}

export const expand =
	(source: MapObject, apply: (applied: MapObject) => void) =>
	(adjusted: MapObject, direction: Direction) =>
		apply(directionDecision[direction](source, deepClone(adjusted)))

const center = (source: MapObject, newData: MapObject) => {
	const [colsToAdd, rowsToAdd] = [
		Math.floor((newData.cols - source.cols) / 2),
		Math.floor((newData.rows - source.rows) / 2),
	]

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	newData.layers.ground = new Array(newData.rows * newData.cols).fill(0).map((_) => ({
		type: 5,
		state: 0,
	}))

	for (let col = 0; col < source.cols; col++) {
		for (let row = 0; row < source.rows; row++) {
			const sourceTile = row * source.cols + col
			const expandedIndex = (row + rowsToAdd) * newData.cols + (col + colsToAdd)
			newData.layers.ground[expandedIndex] = source.layers.ground[sourceTile]
		}
	}

	return newData
}

const directionDecision = {
	'top-left': center,
	top: center,
	'top-right': center,
	left: center,
	center: center,
	right: center,
	'bottom-left': center,
	bottom: center,
	'bottom-right': center,
} as const
