import { unitData } from '$lib/GameData/unit'
import { animationFrame } from '$lib/Sprites/animationFrameCount'
import { get } from 'svelte/store'

type ActiveObject = { state: number; type: number; team?: number }

export const paint =
	(renderData: ObjectRenderer, hudImages: HUDImages) =>
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
		playInfo(map.layers.units[tile])(width, height)(context)
		conditional(renderData.sky, map.layers.sky[tile])?.call(this, width, height, frame)(context)
		advice(map.highlights[tile], hudImages.advice)(width, height)(context)
		route(map.route[tile], hudImages.arrow)(width, height)(context)

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
	(highlight: Highlight | undefined, advice: HTMLImageElement) =>
	(width: number, height: number) =>
	(context: CanvasRenderingContext2D) => {
		if (!highlight) return

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

const playInfo =
	(unit: UnitObject | null) =>
	(width: number, height: number) =>
	(context: CanvasRenderingContext2D) => {
		if (!unit) return

		const health = unit?.health ?? unitData[unit.type].health
		if (health === unitData[unit.type].health) return

		const percentage = health / unitData[unit.type].health
		const color = percentage > 0.65 ? 'green' : percentage > 0.35 ? 'yellow' : 'red'

		context.fillStyle = 'black'
		context.fillRect(5, height - 15, width - 10, 5)
		context.strokeStyle = color
		context.fillStyle = color
		context.lineWidth = 2
		context.fillRect(5, height - 15, percentage * (width - 10), 5)
		context.strokeRect(5, height - 15, width - 10, 5)
	}

const route =
	(route: Route | undefined, arrow: HTMLImageElement) =>
	(width: number, height: number) =>
	(context: CanvasRenderingContext2D) => {
		if (!route) return

		route.rotate
		context.save()
		context.translate(width / 2, height / 2)
		context.rotate((route.rotate * Math.PI) / 2)
		context.translate(-width / 2, -height / 2)
		context.drawImage(arrow, 0, route.state * spriteSize, width, height, 0, 0, width, height)
		context.restore()
	}
