import { unitData } from '$lib/GameData/unit'
import { animationFrame } from '$lib/Sprites/animationFrameCount'
import { get } from 'svelte/store'

type ActiveObject = { state: number; type: number; team?: number }

const spriteSize = 60

export const paint =
	(renderData: ObjectRenderer, hudImages: HUDImages, paused: boolean = false) =>
	(getMap: () => MapObject) =>
	(context: CanvasRenderingContext2D) =>
	(row: number, col: number, left: number, top: number, width: number, height: number) => {
		const render = contextProvider(
			context,
			width,
			height,
			paused ? 0 : get(animationFrame),
			spriteSize / height
		)
		const map = getMap()
		const tile = row * map.cols + col

		context.save()
		context.translate(left, top)

		render.always(map.layers.ground[tile], renderData.ground)
		render.highlights(map.highlights[tile])
		render.conditionally(map.layers.buildings[tile], renderData.building)
		render.conditionally(map.layers.units[tile], renderData.unit)
		render.playInfo(map.layers.units[tile])
		render.conditionally(map.layers.sky[tile], renderData.sky)
		render.advice(map.highlights[tile], hudImages.advice)
		render.route(map.route[tile], hudImages.arrow)

		context.restore()
	}

const contextProvider = (
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	frame: number,
	scale: number
) => ({
	always: always(width, height, frame, scale)(context),
	conditionally: conditionally(width, height, frame, scale)(context),
	highlights: highlights(width, height)(context),
	playInfo: playInfo(width, height, scale)(context),
	advice: advice(width, height)(context),
	route: route(width, height)(context),
})

const renderObject =
	(width: number, height: number, frame: number, scale: number) =>
	(context: CanvasRenderingContext2D) =>
	<T extends ActiveObject>(object: T, render: ObjectSpriteRenderer) =>
		context.drawImage(
			render.sprite[object.team ?? 0],
			object.state * (spriteSize + render.xOffset),
			(frame % render.frames) * (spriteSize + render.yOffset),
			spriteSize + render.xOffset,
			spriteSize + render.yOffset,
			-(render.xOffset / scale),
			-(render.yOffset / scale),
			width + render.xOffset / scale,
			height + render.yOffset / scale
		)

const always =
	(width: number, height: number, frame: number, scale: number) =>
	(context: CanvasRenderingContext2D) =>
	<T extends { state: number; type: number }>(
		object: T,
		renderer: (type: number) => ObjectSpriteRenderer
	) =>
		renderObject(width, height, frame, scale)(context)(object, renderer(object.type))

const conditionally =
	(width: number, height: number, frame: number, scale: number) =>
	(context: CanvasRenderingContext2D) =>
	<T extends { state: number; type: number }>(
		object: T | null,
		renderer: (type: number) => ObjectSpriteRenderer | null
	) =>
		object
			? renderObject(width, height, frame, scale)(context)(
					object,
					renderer(object.type) as ObjectSpriteRenderer
			  )
			: null

const highlights =
	(width: number, height: number) =>
	(context: CanvasRenderingContext2D) =>
	(highlight: Highlight | undefined) => {
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
	(width: number, height: number) =>
	(context: CanvasRenderingContext2D) =>
	(highlight: Highlight | undefined, advice: HTMLImageElement) => {
		if (!highlight) return

		context.globalAlpha = 0.5
		context.drawImage(advice, 0, highlight.type * spriteSize, width, height, 0, 0, width, height)
		context.globalAlpha = 1
		context.drawImage(
			advice,
			spriteSize + highlight.type * spriteSize,
			highlight.tip * spriteSize,
			spriteSize,
			spriteSize,
			0,
			0,
			width,
			height
		)
	}

const playInfo =
	(width: number, height: number, scale: number) =>
	(context: CanvasRenderingContext2D) =>
	(unit: UnitObject | null) => {
		if (!unit) return

		const health = unit?.health ?? unitData[unit.type].health
		if (health === unitData[unit.type].health) return

		const percentage = health / unitData[unit.type].health
		const color = percentage > 0.65 ? 'green' : percentage > 0.35 ? 'yellow' : 'red'
		const offset = 5 / scale

		context.fillStyle = 'black'
		context.fillRect(offset, height - offset * 3, width - offset * 2, offset)
		context.strokeStyle = color
		context.fillStyle = color
		context.lineWidth = 2
		context.fillRect(offset, height - offset * 3, percentage * (width - offset * 2), offset)
		context.strokeRect(offset, height - offset * 3, width - offset * 2, offset)
	}

const route =
	(width: number, height: number) =>
	(context: CanvasRenderingContext2D) =>
	(route: Route | undefined, arrow: HTMLImageElement) => {
		if (!route) return

		context.save()
		context.translate(width / 2, height / 2)
		context.rotate((route.rotate * Math.PI) / 2)
		context.translate(-width / 2, -height / 2)
		context.drawImage(
			arrow,
			0,
			route.state * spriteSize,
			spriteSize,
			spriteSize,
			0,
			0,
			width,
			height
		)
		context.restore()
	}
