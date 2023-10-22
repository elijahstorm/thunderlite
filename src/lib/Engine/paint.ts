import { animationFrame } from '$lib/Sprites/animationFrameCount'
import { get } from 'svelte/store'

type ActiveObject = { state: number; type: number; team?: number }

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
		highlights(map.highlights[tile])(width, height)(context)
		conditional(renderData.building, map.layers.buildings[tile])?.call(
			this,
			width,
			height,
			frame
		)(context)
		conditional(renderData.unit, map.layers.units[tile])?.call(this, width, height, frame)(context)
		conditional(renderData.sky, map.layers.sky[tile])?.call(this, width, height, frame)(context)
		advice(map.highlights[tile])(width, height)(context)

		context.restore()
	}

const spriteSize = 60

const renderObject =
	<T extends ActiveObject>(render: ObjectSpriteRenderer, object: T) =>
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
	renderer: (type: number) => ObjectSpriteRenderer,
	object: T
) => renderObject(renderer(object.type), object)

const conditional = <T extends { state: number; type: number }>(
	renderer: (type?: number) => ObjectSpriteRenderer | null,
	object?: T | null
) => (object ? renderObject(renderer(object.type) as ObjectSpriteRenderer, object) : null)

const highlights =
	(highlight: Highlight | undefined) =>
	(width: number, height: number) =>
	(context: CanvasRenderingContext2D) => {
		if (!highlight) return
		const style = ['green', 'red'][highlight.type]
		context.strokeStyle = style
		context.fillStyle = style
		context.globalAlpha = 0.7
		context.lineWidth = 2
		context.strokeRect(1, 1, width - 1, height - 1)
		context.globalAlpha = 0.2
		context.fillRect(0, 0, width, height)
		context.globalAlpha = 1
	}

const advice =
	(highlight: Highlight | undefined) =>
	(width: number, height: number) =>
	(context: CanvasRenderingContext2D) => {
		if (!highlight) return

		const advice = new Image()
		advice.src = `/game/play/icon/move/advice.png`
		context.globalAlpha = 0.5
		context.drawImage(advice, 0, highlight.type * spriteSize, width, height, 0, 0, width, height)
		context.globalAlpha = 1
		context.drawImage(
			advice,
			spriteSize + highlight.type * spriteSize,
			highlight.tip * spriteSize,
			width,
			height,
			0,
			0,
			width,
			height
		)
	}
