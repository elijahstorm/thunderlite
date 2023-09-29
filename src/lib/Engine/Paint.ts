import { animationFrame } from '$lib/Sprites/animationFrameCount'
import { get } from 'svelte/store'

const renderAlways =
	(type: number) =>
	(renderer: (type: number) => ObjectSpecificRenderer, context: CanvasRenderingContext2D) =>
	(width: number, height: number) =>
	(state: number, animationFrame: number) =>
		context.drawImage(
			renderer(type).sprite,
			state * height + renderer(type).xOffset,
			animationFrame * width + renderer(type).yOffset,
			width,
			height,
			0,
			0,
			width,
			height
		)
const renderConditionally = (type?: number) => (type ? renderAlways(type) : null)

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
		const frame = get(animationFrame)

		renderAlways(map.layers.ground[tile].type)(renderData.ground, context)(width, height)(
			map.layers.ground[tile].state,
			0
		)
		renderConditionally(map.layers.units[tile]?.type)?.call(
			this,
			renderData.unit,
			context
		)(width, height)(map.layers.ground[tile].state, frame)
		renderConditionally(map.layers.sky[tile]?.type)?.call(
			this,
			renderData.sky,
			context
		)(width, height)(map.layers.ground[tile].state, 0)

		context.restore()
	}
