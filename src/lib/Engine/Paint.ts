const renderAlways =
	(renderer: (type: number) => HTMLImageElement, type: number) =>
	(context: CanvasRenderingContext2D) =>
		context.drawImage(renderer(type), 0, 0)
const renderConditionally =
	(renderer: (type: number) => HTMLImageElement, type?: number) =>
	(context: CanvasRenderingContext2D) => (type ? context.drawImage(renderer(type), 0, 0) : null)

export const paint =
	(renderData: ObjectRenderer) =>
	(map: MapObject) =>
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
		context.scale(zoom, zoom)
		context.translate(left, top)

		const tile = col + row * map.rows
		renderAlways(renderData.ground, map.layers.ground[tile].type)(context)
		renderConditionally(renderData.unit, map.layers.units[tile]?.type)(context)
		renderConditionally(renderData.sky, map.layers.sky[tile]?.type)(context)

		context.restore()
	}
