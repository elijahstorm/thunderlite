import { animationFrame } from '$lib/Sprites/animationFrameCount'
import { get } from 'svelte/store'

const renderObject =
	<T extends { state: number; type: number }>(object: T, render: ObjectSpecificRenderer) =>
	(width: number, height: number, animationFrame: number) =>
	(context: CanvasRenderingContext2D) =>
		context.drawImage(
			render.sprite,
			object.state * width + render.xOffset,
			animationFrame * (height + render.yOffset),
			width + render.xOffset,
			height + render.yOffset,
			-render.xOffset,
			-render.yOffset,
			width + render.xOffset,
			height + render.yOffset
		)

const always = <T extends { state: number; type: number }>(
	renderer: (type: number) => ObjectSpecificRenderer,
	object: T
) => renderObject(object, renderer(object.type))

const conditional = <T extends { state: number; type: number }>(
	renderer: (type: number) => ObjectSpecificRenderer,
	object?: T | null
) => (object ? renderObject(object, renderer(object.type)) : null)

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

		always(renderData.ground, map.layers.ground[tile])(width, height, 0)(context)
		conditional(renderData.unit, map.layers.units[tile])?.call(this, width, height, frame)(context)
		conditional(renderData.sky, map.layers.sky[tile])?.call(this, width, height, 0)(context)

		context.restore()
	}
