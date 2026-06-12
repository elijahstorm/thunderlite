import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { ANIMATION_POINTER, ANIMATION_SELECT } from '$lib/GameData/animation'
import { animationFrame } from '$lib/Sprites/animationFrameCount'
import { gameState } from './gameState'
import { interactionSource } from './Interactor/interactionState'
import { get } from 'svelte/store'

type ActiveObject = { state: number; type: number; team?: number }

const spriteSize = 60

export type VisibilityProvider = () => {
	visible: Set<number>
	team: number
} | null

export const paint =
	(
		renderData: ObjectRenderer,
		hudImages: HUDImages,
		paused: boolean = false,
		getVisibility: VisibilityProvider = () => null,
		// The team that actually controls input on this canvas — never the active
		// turn's team. Drives the tile-select idle marker so an AI's or remote
		// opponent's turn doesn't tag their units as selectable to us.
		localTeam: number = 0
	) =>
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
		const fog = getVisibility()
		// While a unit is picked up, move/attack tiles wash the board green/red —
		// the per-unit select markers would compound that visual noise, so hide
		// them until the selection clears.
		const hasSelection = get(interactionSource) !== null
		const tileVisible = !fog || fog.visible.has(tile)
		const unitAtTile = map.layers.units[tile] ?? null
		const hideEnemyUnit =
			!tileVisible && unitAtTile !== null && fog !== null && unitAtTile.team !== fog.team
		// A unit mid attack-animation stays on the map for fog-of-war sight, but its
		// idle sprite is suppressed here so only the attack overlay is drawn.
		const hideIdleUnit = hideEnemyUnit || (unitAtTile?.animating ?? false)
		const state = get(gameState)
		const unitActed =
			unitAtTile !== null && unitAtTile.team === state.currentTeam && state.actedTiles.has(tile)
		// Only the active team's still-available units idle-animate. Units that have
		// spent their action, and every unit belonging to a non-active team, freeze
		// on sprite frame 0.
		const unitAnimates = unitAtTile !== null && unitAtTile.team === state.currentTeam && !unitActed

		context.save()
		context.translate(left, top)

		render.always(map.layers.ground[tile], renderData.ground)
		render.highlights(map.highlights[tile])
		const buildingAtTile = map.layers.buildings[tile] ?? null
		const hideEnemyBuildingCapture =
			!tileVisible && fog !== null && buildingAtTile !== null && buildingAtTile.team !== fog.team
		const buildingActed =
			buildingAtTile !== null &&
			buildingAtTile.team === state.currentTeam &&
			state.actedTiles.has(tile)
		if (buildingActed) {
			context.save()
			context.filter = 'brightness(0.55) saturate(0.5)'
			render.conditionally(buildingAtTile, renderData.building)
			context.restore()
		} else {
			render.conditionally(buildingAtTile, renderData.building)
		}
		if (!hideEnemyBuildingCapture) {
			render.captureProgress(buildingAtTile)
		}
		if (!hideIdleUnit) {
			const drawUnit = unitAnimates ? render.conditionally : render.conditionallyStatic
			if (unitActed) {
				context.save()
				context.filter = 'brightness(0.55) saturate(0.5)'
				context.globalAlpha = 0.75
				drawUnit(unitAtTile, renderData.unit)
				context.restore()
			} else {
				drawUnit(unitAtTile, renderData.unit)
			}
			render.playInfo(unitAtTile)
		}
		render.conditionally(map.layers.sky[tile], renderData.sky)
		render.advice(map.highlights[tile], hudImages.advice)
		render.route(map.route[tile])

		if (!tileVisible) {
			context.fillStyle = 'rgba(0, 0, 0, 0.45)'
			context.fillRect(0, 0, width, height)
		}

		// Selection idle-marker for actionable units. Only shown when the local
		// viewer is also the team currently in control — i.e. it tracks who has
		// the mouse, not whose turn it is — so an AI/remote opponent's turn never
		// tags their units as selectable for us. Drawn after everything else on
		// the tile so it sits above the unit; the PNG's alpha preserves it.
		if (!hideIdleUnit && unitAnimates && state.currentTeam === localTeam && !hasSelection) {
			render.tileAnimation(renderData.animation(ANIMATION_SELECT))
		}

		// Script-driven tile pointer (campaign `highlight`/`unhighlight`). Drawn
		// last so it sits above units and terrain without erasing them.
		if (map.pointers?.has(tile)) {
			render.tileAnimation(renderData.animation(ANIMATION_POINTER))
		}

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
	// Frame-0 variant for units that must not idle-animate (spent or non-active team).
	conditionallyStatic: conditionally(width, height, 0, scale)(context),
	highlights: highlights(width, height, frame)(context),
	playInfo: playInfo(width, height, scale)(context),
	captureProgress: captureProgress(width, height, scale)(context),
	advice: advice(width, height)(context),
	route: route(width, height)(context),
	tileAnimation: tileAnimation(width, height, frame)(context),
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

// Vertical sprite-strip overlay for a single tile (tile-select, tile-pointer).
// Always uses the team-0 (uncolored) sprite, source x=0, since these effects
// have no team variant and only one column. Frame y advances with the shared
// animation counter so every visible tile pulses in lockstep.
const tileAnimation =
	(width: number, height: number, frame: number) =>
	(context: CanvasRenderingContext2D) =>
	(renderer: ObjectSpriteRenderer | null) => {
		if (!renderer) return
		const sprite = renderer.sprite?.[0]
		if (!sprite) return
		const frames = Math.max(1, renderer.frames)
		context.drawImage(
			sprite,
			0,
			(frame % frames) * spriteSize,
			spriteSize,
			spriteSize,
			0,
			0,
			width,
			height
		)
	}

// Distinct visual treatments for move (green) vs attack (red) highlights:
//   move   — soft wash + marching-ants inner border + white corner brackets
//   attack — soft wash + drifting diagonal hatch + red corner crosshairs
// Both pulse gently off the shared `frame` counter so a screen full of cells
// breathes together instead of sitting dead.
const highlights =
	(width: number, height: number, frame: number) =>
	(context: CanvasRenderingContext2D) =>
	(highlight: TileHighlight | undefined) => {
		if (!highlight) return

		// 0..1..0 wave, ticks slowly with the engine's animation cadence.
		const pulse = (Math.sin(frame * 0.35) + 1) / 2

		if (highlight.type === 1) {
			drawAttackHighlight(context, width, height, frame, pulse)
		} else {
			drawMoveHighlight(context, width, height, frame, pulse)
		}
	}

const drawMoveHighlight = (
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	frame: number,
	pulse: number
) => {
	context.save()

	// Soft green wash
	context.fillStyle = `rgba(34, 197, 94, ${0.14 + pulse * 0.06})`
	context.fillRect(0, 0, width, height)

	// Marching-ants inner border — drifts one dash per frame tick so a destination
	// cell visibly *waits* for you instead of sitting static.
	context.strokeStyle = `rgba(134, 239, 172, ${0.85 + pulse * 0.1})`
	context.lineWidth = 1.5
	const dash = Math.max(4, Math.round(width / 12))
	context.setLineDash([dash, dash])
	context.lineDashOffset = -frame * (dash / 2)
	context.strokeRect(2.5, 2.5, width - 5, height - 5)
	context.setLineDash([])

	// White corner brackets — small, clean, read as "you can enter here".
	const len = Math.max(5, Math.round(width / 8))
	const inset = 3
	context.strokeStyle = 'rgba(255, 255, 255, 0.85)'
	context.lineWidth = 1.5
	context.beginPath()
	context.moveTo(inset, inset + len)
	context.lineTo(inset, inset)
	context.lineTo(inset + len, inset)
	context.moveTo(width - inset - len, inset)
	context.lineTo(width - inset, inset)
	context.lineTo(width - inset, inset + len)
	context.moveTo(width - inset, height - inset - len)
	context.lineTo(width - inset, height - inset)
	context.lineTo(width - inset - len, height - inset)
	context.moveTo(inset + len, height - inset)
	context.lineTo(inset, height - inset)
	context.lineTo(inset, height - inset - len)
	context.stroke()

	context.restore()
}

const drawAttackHighlight = (
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	frame: number,
	pulse: number
) => {
	context.save()

	// Soft red wash
	context.fillStyle = `rgba(239, 68, 68, ${0.16 + pulse * 0.08})`
	context.fillRect(0, 0, width, height)

	// Diagonal hatch — the genre-classic danger-zone pattern, scrolling slowly
	// so the whole reach reads as live threat rather than flat decoration.
	context.save()
	context.beginPath()
	context.rect(0, 0, width, height)
	context.clip()
	context.strokeStyle = `rgba(239, 68, 68, ${0.42 + pulse * 0.18})`
	context.lineWidth = 2
	const spacing = Math.max(8, Math.round(width / 7))
	const offset = ((frame * 1.5) % spacing) - spacing
	for (let x = offset - height; x < width + height; x += spacing) {
		context.beginPath()
		context.moveTo(x, 0)
		context.lineTo(x + height, height)
		context.stroke()
	}
	context.restore()

	// Red corner crosshairs — slightly heavier than the move brackets so attack
	// cells feel sharper at a glance.
	const len = Math.max(6, Math.round(width / 7))
	const inset = 2
	context.strokeStyle = 'rgba(254, 202, 202, 0.95)'
	context.lineWidth = 2
	context.beginPath()
	context.moveTo(inset, inset + len)
	context.lineTo(inset, inset)
	context.lineTo(inset + len, inset)
	context.moveTo(width - inset - len, inset)
	context.lineTo(width - inset, inset)
	context.lineTo(width - inset, inset + len)
	context.moveTo(width - inset, height - inset - len)
	context.lineTo(width - inset, height - inset)
	context.lineTo(width - inset - len, height - inset)
	context.moveTo(inset + len, height - inset)
	context.lineTo(inset, height - inset)
	context.lineTo(inset, height - inset - len)
	context.stroke()

	context.restore()
}

const advice =
	(width: number, height: number) =>
	(context: CanvasRenderingContext2D) =>
	(highlight: TileHighlight | undefined, advice: HTMLImageElement) => {
		// The warning overlay is reserved for movement tiles a player can reach
		// but an enemy can also attack — every other highlight skips it.
		if (!highlight || !highlight.threatened) return

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

const captureProgress =
	(width: number, height: number, scale: number) =>
	(context: CanvasRenderingContext2D) =>
	(building: BuildingObject | null) => {
		if (!building) return
		const max = buildingData[building.type]?.stature ?? 0
		if (max <= 0) return
		const current = typeof building.stature === 'number' ? building.stature : max
		if (current >= max) return

		const offset = 5 / scale
		const fontSize = Math.max(8, Math.round(height / 4))
		const text = String(current)
		context.save()
		context.font = `bold ${fontSize}px sans-serif`
		context.textBaseline = 'top'
		context.textAlign = 'left'
		context.fillStyle = 'rgba(0,0,0,0.65)'
		context.fillRect(offset, offset, fontSize * (text.length + 1), fontSize + offset)
		context.fillStyle = '#fff'
		context.fillText(text, offset * 1.5, offset * 1.5)
		context.restore()
	}

// Route arrow drawn programmatically to match the new highlight aesthetic:
// glowing cyan path + chevron arrowhead on the end tile. Each segment is drawn
// in its base orientation (state 0 = south-tail, 1 = N→E corner, 2 = horizontal,
// 3 = east-pointing arrowhead); the caller rotates the canvas to orient it.
// The arrowhead lands at the tile centre so the destination reads as "stop
// here" rather than "continue past".
const route =
	(width: number, height: number) =>
	(context: CanvasRenderingContext2D) =>
	(route: Route | undefined) => {
		if (!route) return

		context.save()
		context.translate(width / 2, height / 2)
		context.rotate((route.rotate * Math.PI) / 2)
		context.translate(-width / 2, -height / 2)
		drawRouteSegment(context, width, height, route.state)
		context.restore()
	}

const drawRouteSegment = (ctx: CanvasRenderingContext2D, w: number, h: number, state: number) => {
	const cx = w / 2
	const cy = h / 2
	const thickness = Math.max(8, Math.round(w / 6))
	const colorMain = 'rgba(56, 189, 248, 0.95)'
	const colorGlow = 'rgba(125, 211, 252, 0.45)'
	// Arrowhead lands at tile centre; the shaft on the end tile only reaches the
	// base of the chevron so the silhouette clearly terminates at the centre.
	const arrowDepth = Math.round(w * 0.22)
	const shaftEndX = cx - arrowDepth

	let path: [number, number][] = []
	switch (state) {
		case 0:
			path = [
				[cx, cy],
				[cx, h],
			]
			break
		case 1:
			path = [
				[cx, 0],
				[cx, cy],
				[w, cy],
			]
			break
		case 2:
			path = [
				[0, cy],
				[w, cy],
			]
			break
		case 3:
			path = [
				[0, cy],
				[shaftEndX, cy],
			]
			break
	}

	ctx.lineCap = 'round'
	ctx.lineJoin = 'round'

	// Outer glow halo
	ctx.strokeStyle = colorGlow
	ctx.lineWidth = thickness + 5
	strokePath(ctx, path)

	// Main body
	ctx.strokeStyle = colorMain
	ctx.lineWidth = thickness
	strokePath(ctx, path)

	if (state === 3) drawArrowhead(ctx, cx, cy, shaftEndX, thickness, colorMain, colorGlow)
}

const strokePath = (ctx: CanvasRenderingContext2D, path: [number, number][]) => {
	if (path.length < 2) return
	ctx.beginPath()
	ctx.moveTo(path[0][0], path[0][1])
	for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1])
	ctx.stroke()
}

const drawArrowhead = (
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	baseX: number,
	thickness: number,
	main: string,
	glow: string
) => {
	const tipX = cx
	const wing = thickness * 1.1

	// Halo
	ctx.fillStyle = glow
	ctx.beginPath()
	ctx.moveTo(tipX + 2, cy)
	ctx.lineTo(baseX - 3, cy - wing - 2)
	ctx.lineTo(baseX - 3, cy + wing + 2)
	ctx.closePath()
	ctx.fill()

	// Main triangle
	ctx.fillStyle = main
	ctx.beginPath()
	ctx.moveTo(tipX, cy)
	ctx.lineTo(baseX, cy - wing)
	ctx.lineTo(baseX, cy + wing)
	ctx.closePath()
	ctx.fill()

	// Inner highlight pip — small white reflection so the arrowhead reads as 3D.
	ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
	ctx.beginPath()
	ctx.moveTo(tipX - thickness * 0.45, cy)
	ctx.lineTo(baseX + thickness * 0.1, cy - wing * 0.5)
	ctx.lineTo(baseX + thickness * 0.1, cy + wing * 0.5)
	ctx.closePath()
	ctx.fill()
}
