export const paint =
	(context: CanvasRenderingContext2D) =>
	(
		row: number,
		col: number,
		left: number,
		top: number,
		width: number,
		height: number,
		zoom: number
	) => {
		context.save()
		context.translate(left, top)

		context.fillStyle = (row % 2) + (col % 2) > 0 ? '#ddd' : '#fff'
		context.fillRect(0, 0, width, height)

		context.fillStyle = 'green'
		context.font = (14 * zoom).toFixed(2) + 'px "Helvetica Neue", Helvetica, Arial, sans-serif'

		context.fillText(`${row}, ${col}`, 6 * zoom, 18 * zoom)

		context.restore()
	}
