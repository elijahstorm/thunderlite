/* eslint-disable @typescript-eslint/ban-ts-comment */

export const deepClone = <T>(obj: T): T => {
	if (Array.isArray(obj)) {
		const clonedArray = [] as T
		for (const key in obj) {
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

export const reform =
	(source: MapObject, apply: (applied: MapObject) => void) =>
	(adjusted: MapObject, direction: Direction) =>
		apply(expand(source, deepClone(adjusted), directionDecision[direction]))

const expand = (
	source: MapObject,
	newData: MapObject,
	calculateNewDimensions: typeof directionDecision.center
) => {
	const { add, remove } = calculateNewDimensions(source, newData)

	for (const key in newData.layers) {
		// @ts-ignore
		newData.layers[key] = []
	}

	newData.layers.ground = new Array(newData.rows * newData.cols)
		.fill(0)
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		.map((_) => ({ type: 5, state: 0 }))

	for (let col = 0; col < source.cols; col++) {
		for (let row = 0; row < source.rows; row++) {
			const sourceTile = row * source.cols + col
			const expandedTile = (row + add.rows) * newData.cols + col + add.cols

			if (
				expandedTile < 0 ||
				col + add.cols < 0 ||
				col + remove.cols >= source.cols ||
				row + remove.rows >= source.rows
			) {
				continue
			}

			for (const key in newData.layers) {
				// @ts-ignore
				newData.layers[key][expandedTile] = deepClone(source.layers[key][sourceTile])
			}
		}
	}

	return newData
}

const topLeft = (source: MapObject, newData: MapObject) => ({
	add: {
		cols: 0,
		rows: 0,
	},
	remove: {
		cols: source.cols - newData.cols,
		rows: source.rows - newData.rows,
	},
})

const top = (source: MapObject, newData: MapObject) => ({
	add: {
		cols: Math.floor((newData.cols - source.cols) / 2),
		rows: 0,
	},
	remove: {
		cols: Math.floor((source.cols - newData.cols) / 2),
		rows: source.rows - newData.rows,
	},
})

const topRight = (source: MapObject, newData: MapObject) => ({
	add: {
		cols: newData.cols - source.cols,
		rows: 0,
	},
	remove: {
		cols: 0,
		rows: source.rows - newData.rows,
	},
})

const left = (source: MapObject, newData: MapObject) => ({
	add: {
		cols: 0,
		rows: Math.floor((newData.rows - source.rows) / 2),
	},
	remove: {
		cols: source.cols - newData.cols,
		rows: Math.floor((source.rows - newData.rows) / 2),
	},
})

const center = (source: MapObject, newData: MapObject) => ({
	add: {
		cols: Math.floor((newData.cols - source.cols) / 2),
		rows: Math.floor((newData.rows - source.rows) / 2),
	},
	remove: {
		cols: Math.floor((source.cols - newData.cols) / 2),
		rows: Math.floor((source.rows - newData.rows) / 2),
	},
})

const right = (source: MapObject, newData: MapObject) => ({
	add: {
		cols: newData.cols - source.cols,
		rows: Math.floor((newData.rows - source.rows) / 2),
	},
	remove: {
		cols: 0,
		rows: Math.floor((source.rows - newData.rows) / 2),
	},
})

const bottomLeft = (source: MapObject, newData: MapObject) => ({
	add: {
		cols: 0,
		rows: newData.rows - source.rows,
	},
	remove: {
		cols: source.cols - newData.cols,
		rows: 0,
	},
})

const bottom = (source: MapObject, newData: MapObject) => ({
	add: {
		cols: Math.floor((newData.cols - source.cols) / 2),
		rows: newData.rows - source.rows,
	},
	remove: {
		cols: Math.floor((source.cols - newData.cols) / 2),
		rows: 0,
	},
})

const bottomRight = (source: MapObject, newData: MapObject) => ({
	add: {
		cols: newData.cols - source.cols,
		rows: newData.rows - source.rows,
	},
	remove: {
		cols: 0,
		rows: 0,
	},
})

const directionDecision = {
	topLeft,
	top,
	topRight,
	left,
	center,
	right,
	bottomLeft,
	bottom,
	bottomRight,
} as const
