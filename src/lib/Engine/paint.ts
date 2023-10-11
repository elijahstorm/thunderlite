import { animationFrame } from '$lib/Sprites/animationFrameCount'
import { get } from 'svelte/store'

type ActiveObject = { state: number; type: number; team?: number }

const spriteSize = 60

const renderObject =
	<T extends ActiveObject>(render: ObjectSpecificRenderer, object: T) =>
	(width: number, height: number, animationFrame: number) =>
	(context: CanvasRenderingContext2D) =>
		context.drawImage(
			render.sprite[object.team ?? 0],
			object.state * (spriteSize + render.xOffset),
			(animationFrame % render.frames) * (spriteSize + render.yOffset),
			spriteSize + render.xOffset,
			spriteSize + render.yOffset,
			-render.xOffset,
			-render.yOffset,
			width + render.xOffset,
			height + render.yOffset
		)

const always = <T extends { state: number; type: number }>(
	renderer: (type: number) => ObjectSpecificRenderer,
	object: T
) => renderObject(renderer(object.type), object)

const conditional = <T extends { state: number; type: number }>(
	renderer: (type?: number) => ObjectSpecificRenderer | null,
	object?: T | null
) => (object ? renderObject(renderer(object.type) as ObjectSpecificRenderer, object) : null)

export const paint =
	(renderData: ObjectRenderer) =>
	(getMap: () => MapObject) =>
	(context: CanvasRenderingContext2D) =>
	(row: number, col: number, left: number, top: number, width: number, height: number) => {
		context.save()
		context.translate(left, top)

		const map = getMap()
		const tile = row * map.cols + col
		const frame = get(animationFrame)

		always(renderData.ground, map.layers.ground[tile])(width, height, frame)(context)
		conditional(renderData.unit, map.layers.units[tile])?.call(this, width, height, frame)(context)
		conditional(renderData.sky, map.layers.sky[tile])?.call(this, width, height, frame)(context)

		context.restore()
	}
