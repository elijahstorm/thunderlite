import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { ANIMATION_POINTER, ANIMATION_SELECT } from '$lib/GameData/animation'
import { animationFrame } from '$lib/Sprites/animationFrameCount'
import { gameState } from './gameState'
import { interactionSource } from './Interactor/interactionState'
import { computeFogMask, drawFog, observeFog, observeUnitFade } from './fogRender'
import { isUnitStealthed } from './visibility'
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
		localTeam: number = 0,
		// Map-editor mode: there is no "selectable unit" gameplay, so the per-unit
		// idle select marker is suppressed entirely.
		editor: boolean = false
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
		// Cloak opacity from the viewer's vantage (`localTeam`): an enemy cloaked unit
		// fades all the way out, our own cloaked unit settles at 50% so we can still
		// read its state, everyone else stays solid. Eased per-tile (observeUnitFade)
		// so it animates in/out rather than popping. A spectator with no team
		// (localTeam < 0) sees everyone at full.
		const stealthed = unitAtTile !== null && isUnitStealthed(map, tile, unitAtTile)
		const unitAlphaTarget =
			stealthed && localTeam >= 0 ? (unitAtTile!.team === localTeam ? 0.5 : 0) : 1
		const unitAlpha = unitAtTile !== null ? observeUnitFade(tile, unitAlphaTarget) : 1

		context.save()
		context.translate(left, top)

		render.always(map.layers.ground[tile], renderData.ground)
		render.corners(map.layers.ground[tile], renderData.ground)
		// Persistent enemy-threat overlay, drawn under the active selection
		// highlights so a unit you're currently moving still reads on top.
		render.threat(map.threatTiles?.has(tile) ?? false)
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
		if (!hideIdleUnit && unitAlpha > 0.01) {
			const drawUnit = unitAnimates ? render.conditionally : render.conditionallyStatic
			context.save()
			if (unitActed) {
				context.filter = 'brightness(0.55) saturate(0.5)'
				context.globalAlpha = 0.75 * unitAlpha
			} else {
				context.globalAlpha = unitAlpha
			}
			drawUnit(unitAtTile, renderData.unit)
			context.restore()
		}
		// HP/status bar: drawn whenever the unit is on-screen, *independent* of
		// `hideIdleUnit` — that flag suppresses only the idle sprite (so an attack
		// overlay can show alone), but a hurt unit's bar must stay visible right
		// through its swing/counter and not blink out. Read at full strength even on
		// a dimmed cloaked unit; only fog-hidden / fully-faded units skip it.
		if (unitAtTile !== null && !hideEnemyUnit && unitAlpha > 0.01) {
			render.playInfo(unitAtTile)
		}
		render.conditionally(map.layers.sky[tile], renderData.sky)
		render.advice(map.highlights[tile], hudImages.advice)
		render.route(map.route[tile])

		// Fog veil. Every tile carries a fade level eased toward its target
		// (covered → 1, visible → 0), so the veil animates in and out instead of
		// popping. We must run this for *visible* tiles too while they finish
		// receding — `tileVisible` flips the gameplay state instantly (enemy units
		// hide the moment a tile is covered), but the dithered veil grows/dissolves
		// over a few frames. The overlay crumbles organically wherever a covered
		// tile abuts a seen one, and stays solid in the fogged interior.
		if (fog) {
			const fogValue = observeFog(tile, tileVisible ? 0 : 1)
			if (fogValue > 0.002) {
				const fogMask = computeFogMask(fog.visible, row, col, map.rows, map.cols)
				drawFog(context, width, height, fogMask, fogValue)
			}
		}

		// Selection idle-marker for actionable units. Only shown when the local
		// viewer is also the team currently in control — i.e. it tracks who has
		// the mouse, not whose turn it is — so an AI/remote opponent's turn never
		// tags their units as selectable for us. Drawn after everything else on
		// the tile so it sits above the unit; the PNG's alpha preserves it.
		if (!editor && !hideIdleUnit && unitAnimates && state.currentTeam === localTeam && !hasSelection) {
			render.tileAnimation(renderData.animation(ANIMATION_SELECT))
		}

		// Script-driven tile pointer (campaign `highlight`/`unhighlight`). Drawn
		// last so it sits above units and terrain without erasing them.
		if (map.pointers?.has(tile)) {
			render.tileAnimation(renderData.animation(ANIMATION_POINTER))
		}

		// Map-boundary frame: for any tile on the outer edge, draw a border along
		// the side(s) that face off-map. This gives both gameplay and the editor a
		// clear "here the map ends" cue instead of terrain bleeding straight into
		// the backdrop. Drawn last so it sits above everything as a clean frame.
		render.mapBorder(col === 0, col === map.cols - 1, row === 0, row === map.rows - 1)

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
	corners: corners(width, height, frame)(context),
	conditionally: conditionally(width, height, frame, scale)(context),
	// Frame-0 variant for units that must not idle-animate (spent or non-active team).
	conditionallyStatic: conditionally(width, height, 0, scale)(context),
	highlights: highlights(width, height, frame)(context),
	threat: threatHighlight(width, height, frame)(context),
	playInfo: playInfo(width, height, scale)(context),
	captureProgress: captureProgress(width, height, scale)(context),
	advice: advice(width, height)(context),
	route: route(width, height)(context),
	tileAnimation: tileAnimation(width, height, frame)(context),
	mapBorder: mapBorder(width, height)(context),
})

// Map-boundary frame: a riveted gunmetal armour plate running along whichever
// sides of an edge tile face off-map — the battlefield reads as fenced in by a
// steel bulwark rather than a flat line. The plate is drawn *outward* into the
// off-map margin (negative / past-the-edge tile coordinates) so it never covers
// terrain or units in the playfield; only the thin bevel lip sits on the very
// boundary. Drawing outside the tile is safe because the Scroller now clears the
// canvas every frame. Rivets are placed at fixed fractions of the edge so the
// pattern in every edge tile lines up into one continuous riveted run.
const PLATE_RIM = '#161a21'
const PLATE_DARK = '#2b323d'
const PLATE_MID = '#48515f'
const PLATE_LIGHT = '#6c7888'
const PLATE_BEVEL = 'rgba(160, 172, 190, 0.7)'

const drawRivet = (context: CanvasRenderingContext2D, cx: number, cy: number, r: number) => {
	// Lit from the top-left so a row of rivets reads as raised studs.
	const gradient = context.createRadialGradient(
		cx - r * 0.35,
		cy - r * 0.35,
		r * 0.1,
		cx,
		cy,
		r
	)
	gradient.addColorStop(0, '#9aa6b6')
	gradient.addColorStop(0.55, '#5c6675')
	gradient.addColorStop(1, '#20262f')
	context.beginPath()
	context.arc(cx, cy, r, 0, Math.PI * 2)
	context.fillStyle = gradient
	context.fill()
	context.lineWidth = Math.max(0.5, r * 0.16)
	context.strokeStyle = 'rgba(0, 0, 0, 0.4)'
	context.stroke()
}

const mapBorder =
	(width: number, height: number) =>
	(context: CanvasRenderingContext2D) =>
	(left: boolean, right: boolean, top: boolean, bottom: boolean) => {
		if (!left && !right && !top && !bottom) return

		const band = Math.max(5, Math.round(Math.min(width, height) * 0.18))
		const rivetR = Math.max(1.5, band * 0.22)

		// Draw one plate per off-map side, extending *outward* from the tile edge.
		//   vertical  — band runs down a left/right edge; gradient sweeps across X.
		//   !vertical — band caps a top/bottom edge; gradient sweeps across Y.
		// `outer` is the rim coord (furthest into the backdrop), `inner` the lip on
		// the map boundary. `alongStart..alongEnd` is the band's extent along the
		// edge — top/bottom bands stretch past the corners so corner tiles fill the
		// join. Both lie outside the tile rect (negative or > width/height).
		const drawBand = (
			vertical: boolean,
			outer: number,
			inner: number,
			alongStart: number,
			alongEnd: number
		) => {
			const gradient = vertical
				? context.createLinearGradient(outer, 0, inner, 0)
				: context.createLinearGradient(0, outer, 0, inner)
			gradient.addColorStop(0, PLATE_RIM)
			gradient.addColorStop(0.22, PLATE_DARK)
			gradient.addColorStop(0.55, PLATE_MID)
			gradient.addColorStop(0.85, PLATE_LIGHT)
			gradient.addColorStop(1, PLATE_MID)
			context.fillStyle = gradient
			const x = vertical ? Math.min(outer, inner) : alongStart
			const y = vertical ? alongStart : Math.min(outer, inner)
			const w = vertical ? Math.abs(inner - outer) : alongEnd - alongStart
			const h = vertical ? alongEnd - alongStart : Math.abs(inner - outer)
			context.fillRect(x, y, w, h)

			// Crisp bevel highlight along the lip that meets the map boundary.
			context.strokeStyle = PLATE_BEVEL
			context.lineWidth = Math.max(1, band * 0.08)
			context.beginPath()
			if (vertical) {
				context.moveTo(inner, alongStart)
				context.lineTo(inner, alongEnd)
			} else {
				context.moveTo(alongStart, inner)
				context.lineTo(alongEnd, inner)
			}
			context.stroke()

			// Rivet line centred across the band. Count derives from the edge length
			// so studs stay evenly spaced and identical in every edge tile → seamless.
			const span = alongEnd - alongStart
			const mid = (outer + inner) / 2
			const count = Math.max(1, Math.round(span / (band * 2.4)))
			for (let i = 0; i < count; i++) {
				const along = alongStart + ((i + 0.5) / count) * span
				if (vertical) drawRivet(context, mid, along, rivetR)
				else drawRivet(context, along, mid, rivetR)
			}
		}

		context.save()
		context.lineCap = 'butt'
		// Top/bottom plates run the full width, extended past any adjoining
		// left/right edge so the outer corner square is filled by the cap plate.
		const xStart = left ? -band : 0
		const xEnd = right ? width + band : width
		if (top) drawBand(false, -band, 0, xStart, xEnd)
		if (bottom) drawBand(false, height + band, height, xStart, xEnd)
		if (left) drawBand(true, -band, 0, 0, height)
		if (right) drawBand(true, width + band, width, 0, height)
		context.restore()
	}

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

// Quadrant a corner sprite frame occupies, as [x, y] halves of the tile:
// 16=top-left, 17=bottom-left, 18=bottom-right, 19=top-right.
const cornerQuadrant: Record<number, [0 | 1, 0 | 1]> = {
	16: [0, 0],
	17: [0, 1],
	18: [1, 1],
	19: [1, 0],
}

// Inner-corner overlays for coastline water. The base tile is already drawn; each
// listed corner frame (16-19) is plain water except in one quadrant, so we copy
// just that quadrant over the matching quadrant of the tile. This lets a single
// water tile show several land corners at once — something the one-frame `state`
// can't express on its own.
const corners =
	(width: number, height: number, frame: number) =>
	(context: CanvasRenderingContext2D) =>
	(object: GroundObject, renderer: (type: number) => ObjectSpriteRenderer) => {
		const list = object.corners
		if (!list || list.length === 0) return
		const render = renderer(object.type)
		const sprite = render.sprite[0]
		if (!sprite) return
		const half = spriteSize / 2
		const sourceY = (frame % render.frames) * (spriteSize + render.yOffset)
		const destHalfWidth = width / 2
		const destHalfHeight = height / 2
		for (const corner of list) {
			const quadrant = cornerQuadrant[corner]
			if (!quadrant) continue
			const [qx, qy] = quadrant
			context.drawImage(
				sprite,
				corner * (spriteSize + render.xOffset) + qx * half,
				sourceY + qy * half,
				half,
				half,
				qx * destHalfWidth,
				qy * destHalfHeight,
				destHalfWidth,
				destHalfHeight
			)
		}
	}

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

		if (highlight.shadowed) {
			drawShadowHighlight(context, width, height, pulse)
		} else if (highlight.type === 1) {
			drawAttackHighlight(context, width, height, frame, pulse)
		} else {
			drawMoveHighlight(context, width, height, frame, pulse)
		}
	}

// Firing shadow — dead ground an indirect unit can't reach. A muted grey wash with
// static diagonal hatching reads as "blocked / unavailable" and stays visually
// subordinate to the live red attack range it sits beside.
const drawShadowHighlight = (
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	pulse: number
) => {
	context.save()

	context.fillStyle = `rgba(30, 41, 59, ${0.34 + pulse * 0.06})`
	context.fillRect(0, 0, width, height)

	context.strokeStyle = 'rgba(148, 163, 184, 0.5)'
	context.lineWidth = 1
	context.beginPath()
	const step = Math.max(4, Math.round(width / 5))
	for (let x = -height; x < width; x += step) {
		context.moveTo(x, 0)
		context.lineTo(x + height, height)
	}
	context.stroke()

	context.restore()
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

// Persistent enemy-threat overlay. Deliberately distinct from the active attack
// highlight: a deeper crimson wash, a *counter*-diagonal hatch (the attack hatch
// leans the other way), and a dashed perimeter instead of corner crosshairs — so
// "where the enemy can hit me" never gets confused with "where my unit can hit".
const threatHighlight =
	(width: number, height: number, frame: number) =>
	(context: CanvasRenderingContext2D) =>
	(active: boolean) => {
		if (!active) return
		const pulse = (Math.sin(frame * 0.35) + 1) / 2
		drawThreatHighlight(context, width, height, frame, pulse)
	}

const drawThreatHighlight = (
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	frame: number,
	pulse: number
) => {
	context.save()

	// Deeper crimson wash, a touch stronger than the active attack red.
	context.fillStyle = `rgba(190, 18, 60, ${0.15 + pulse * 0.07})`
	context.fillRect(0, 0, width, height)

	// Counter-diagonal hatch (bottom-left → top-right), mirroring the attack
	// hatch's lean so the two patterns read apart at a glance.
	context.save()
	context.beginPath()
	context.rect(0, 0, width, height)
	context.clip()
	context.strokeStyle = `rgba(244, 63, 94, ${0.4 + pulse * 0.16})`
	context.lineWidth = 2
	const spacing = Math.max(8, Math.round(width / 7))
	const offset = ((frame * 1.5) % spacing) - spacing
	for (let x = offset - height; x < width + height; x += spacing) {
		context.beginPath()
		context.moveTo(x, height)
		context.lineTo(x + height, 0)
		context.stroke()
	}
	context.restore()

	// Dashed crimson perimeter — a steady frame around the danger area.
	context.strokeStyle = `rgba(254, 205, 211, ${0.7 + pulse * 0.12})`
	context.lineWidth = 1.5
	const dash = Math.max(4, Math.round(width / 10))
	context.setLineDash([dash, dash])
	context.strokeRect(1.5, 1.5, width - 3, height - 3)
	context.setLineDash([])

	context.restore()
}

const advice =
	(width: number, height: number) =>
	(context: CanvasRenderingContext2D) =>
	(highlight: TileHighlight | undefined, advice: HTMLImageElement) => {
		// Drawn on every actionable tile. The base glyph (column 0) marks what the
		// tile *is* — footsteps on a reachable move tile (row 0), the red marker on
		// an attackable one (row 1) — and a severity badge layered on top rates it:
		// move advice in column 1, attack advice in column 2, rows good→terrible.
		// Firing-shadow tiles aren't real targets, so they carry no advice icon.
		if (!highlight || highlight.shadowed) return

		// Base glyph at half strength so it reads as a wash beneath the badge.
		context.globalAlpha = 0.5
		context.drawImage(
			advice,
			0,
			highlight.type * spriteSize,
			spriteSize,
			spriteSize,
			0,
			0,
			width,
			height
		)
		context.globalAlpha = 1
		// Severity badge: column 1 for move advice, column 2 for attack advice.
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

		const max = unitData[unit.type].health
		const actual = unit?.health ?? max
		// `displayHealth` is the eased value the bar slides to after combat; fall back
		// to the real health when no animation is in flight. Stay visible whenever
		// *either* value is below full so a heal still shows the bar rising to the cap
		// and damage from full still shows it draining from the cap.
		const health = unit?.displayHealth ?? actual
		if (health >= max && actual >= max) return

		const percentage = Math.max(0, Math.min(1, health / max))

		// Gradient [light → dark] per health band — softer than raw green/red.
		const [light, dark] =
			percentage > 0.65
				? ['#86efac', '#22c55e']
				: percentage > 0.35
					? ['#fde047', '#eab308']
					: ['#fca5a5', '#ef4444']

		const offset = 5 / scale
		const margin = offset
		const barHeight = offset * 1.3
		const barWidth = width - margin * 2
		const x = margin
		const y = height - barHeight - margin
		const radius = barHeight / 2

		context.save()

		// Track: dark translucent pill with a soft drop shadow so the bar stays
		// legible over bright sprites or terrain behind it.
		context.shadowColor = 'rgba(0,0,0,0.5)'
		context.shadowBlur = offset * 0.6
		context.shadowOffsetY = offset * 0.15
		context.fillStyle = 'rgba(15,23,42,0.85)'
		context.beginPath()
		context.roundRect(x, y, barWidth, barHeight, radius)
		context.fill()
		context.shadowColor = 'transparent'
		context.shadowBlur = 0
		context.shadowOffsetY = 0

		// Fill: vertical gradient clipped to current health, inset slightly so the
		// dark track reads as a clean border around it.
		const inset = barHeight * 0.18
		const fillHeight = barHeight - inset * 2
		const fillWidth = Math.max(0, (barWidth - inset * 2) * percentage)
		if (fillWidth > 0) {
			const fillRadius = fillHeight / 2
			const gradient = context.createLinearGradient(0, y, 0, y + barHeight)
			gradient.addColorStop(0, light)
			gradient.addColorStop(1, dark)
			context.fillStyle = gradient
			context.beginPath()
			context.roundRect(x + inset, y + inset, fillWidth, fillHeight, fillRadius)
			context.fill()

			// Glossy highlight along the top of the fill for a bit of depth.
			context.fillStyle = 'rgba(255,255,255,0.35)'
			context.beginPath()
			context.roundRect(x + inset, y + inset, fillWidth, fillHeight * 0.4, fillRadius)
			context.fill()
		}

		context.restore()
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
