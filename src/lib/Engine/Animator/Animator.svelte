<script lang="ts">
	import {
		ANIMATION_TIME,
		routeAnimation,
		animations,
		getDirection,
		startIncrementer,
	} from './animator'
	import { unitData } from '$lib/GameData/unit'
	import { animationFrame, overlayFrame } from '$lib/Sprites/animationFrameCount'
	import { rendererStore } from '$lib/Sprites/spriteStore'
	import { viewerVisibility } from '$lib/Engine/fogState'
	import { viewerTeam } from '$lib/Engine/threatOverlay'
	import { isUnitStealthed, unitSeenByViewer } from '$lib/Engine/visibility'
	import { fly } from 'svelte/transition'
	import { linear } from 'svelte/easing'

	export let offset: { x: number; y: number }
	export let cellWidth = 60
	export let cellHeight = 60

	let index = 0
	let hideNewInstance = false

	// Fog mask: when fog is on, suppress overlays whose source tile isn't in the
	// viewer's visibility set. The canvas already dims those tiles; without this
	// the DOM overlays would happily flash unit/attack/explosion sprites on top
	// of the dimmed canvas, exposing what fog is meant to hide.
	const tileVisible = (tile: number, fog: typeof $viewerVisibility) =>
		fog === null || fog.visible.has(tile)

	// Whether the moving unit's sprite should render at path `step`, from the local
	// viewer's vantage. The viewer's own unit always renders above the fog, even on
	// tiles dark from its start vantage: we don't recompute sight per step (fog only
	// refreshes once it lands), so without this it would blink out the moment it left
	// its start tile's radius. An enemy step is suppressed when fog covers that tile,
	// or when the unit is concealed there (cloak / stealth) — evaluated per step, so a
	// stealth unit only flickers into view for the stretch of its path that crosses
	// our jammer's radar ring, then vanishes again once it leaves.
	const routeVisible = (
		route: typeof $routeAnimation,
		fog: typeof $viewerVisibility,
		team: number,
		step: number
	) => {
		if (route === null) return false
		const tile = route.route[step]
		if (route.unit.team === team) return true
		// Per-unit fog check: an airborne enemy stays visible stepping over a
		// canopy-dark forest or behind a ridge (unitSeenByViewer widens to the air
		// reach) — only ground units blink out on those tiles.
		if (!unitSeenByViewer(fog, tile, route.unit)) return false
		return !isUnitStealthed(route.map, tile, route.unit)
	}

	// Per-step opacity for the moving sprite, mirroring the static board (paint.ts):
	// the viewer's own concealed unit walks at half opacity so you can still read it,
	// and snaps back to solid for the tiles it spends inside an enemy radar ring (it's
	// exposed there). Enemy units only ever reach here when routeVisible already
	// cleared them, so they ride at full strength.
	const routeOpacity = (route: typeof $routeAnimation, team: number, step: number) => {
		if (route === null || route.unit.team !== team) return 1
		return isUnitStealthed(route.map, route.route[step], route.unit) ? 0.5 : 1
	}

	const traverseRoute = (route: number[] | null) => {
		if (route === null) {
			return
		}

		index = 0
		startIncrementer(
			() => {
				index++
				hideNewInstance = true
			},
			() => index < route.length - 1
		)
	}

	const parseRoute = (route: typeof $routeAnimation) => {
		if (route === null) return null
		// The renderer may be missing (a unit type's sprite hasn't decoded yet, or
		// a headless/test context) — never index into it blindly. A throw here lands
		// inside the render effect and corrupts the whole reactive tree, which reads
		// as "animations freeze and the board snaps to its final state". Bail to null
		// (render() treats that as no overlay) instead.
		const source = $rendererStore.units[route.unit.type]?.sprite?.[route.unit.team ?? 0]?.src
		if (!source) return null
		const { x, y } = tileToXY(route.map, route.route[index])
		const unit = unitData[route.unit.type]
		return {
			x,
			y,
			source,
			xOffset: unit.xOffset,
			yOffset: unit.yOffset,
			frames: unit.frames,
			state: getDirection(route.map, route.route, index),
		}
	}

	const render = (
		animation: {
			x: number
			y: number
			source: string
			xOffset: number
			yOffset: number
			frames: number
			state: number
			scale?: number
			width?: number
			height?: number
			states?: number
		} | null,
		frame: number
	) => {
		if (animation === null) return ''
		const { x, y, scale = 60 / cellHeight, source, frames, state, states = 6 } = animation
		let { xOffset, yOffset, width, height } = animation
		xOffset /= scale
		yOffset /= scale
		width = !width ? cellWidth + xOffset : width / scale
		height = !height ? cellHeight + yOffset : height / scale
		return `
			left: ${x * cellWidth - xOffset - offset.x}px;
			top: ${y * cellHeight - yOffset - offset.y}px; 
			width: ${width}px;
			height: ${height}px;
			background-image: url('${source}');
			background-position: ${-state * width}px ${(-frame % frames) * height}px;
			background-size: ${width * states}px ${height * frames}px;
		`
	}

	const tileToXY = (map: MapObject, tile: number) => ({
		x: tile % map.cols,
		y: Math.floor(tile / map.cols),
	})

	// Health bar for the *moving* unit. During a move the unit is lifted off the
	// board and drawn as this DOM overlay, so the canvas bar would vanish for the
	// whole slide. We render the bar as a *child of the sprite mover div* so it
	// inherits the exact same out:fly transform and glides with the unit instead of
	// snapping tile-to-tile. Coordinates are therefore div-local: the sprite div's
	// box starts at (tileX − xOffset, tileY − yOffset), so the unit's cell sits at
	// (xOffset, yOffset) within it (offsets scaled the same way render() scales them).
	// Geometry below the offsets mirrors paint.ts `playInfo` so the bar lines up with
	// the static canvas bar before and after the move.
	const healthBands = (p: number): [string, string] =>
		p > 0.65 ? ['#86efac', '#22c55e'] : p > 0.35 ? ['#fde047', '#eab308'] : ['#fca5a5', '#ef4444']

	const parseRouteHealth = (route: typeof $routeAnimation) => {
		if (route === null) return null
		const unit = route.unit
		const data = unitData[unit.type]
		const max = data?.health ?? 0
		if (max <= 0) return null
		const health = unit.displayHealth ?? unit.health ?? max
		if (health >= max) return null
		// Match render()'s scaling so the bar's div-local origin tracks the sprite.
		const scale = 60 / cellHeight
		return {
			percentage: Math.max(0, Math.min(1, health / max)),
			xOffset: data.xOffset / scale,
			yOffset: data.yOffset / scale,
		}
	}

	type RouteBar = NonNullable<ReturnType<typeof parseRouteHealth>>

	const routeBarTrackStyle = (bar: RouteBar) => {
		const o = (5 * cellHeight) / 60
		const barHeight = o * 1.3
		return `
			left: ${bar.xOffset + o}px;
			top: ${bar.yOffset + cellHeight - barHeight - o}px;
			width: ${cellWidth - o * 2}px;
			height: ${barHeight}px;
			border-radius: ${barHeight / 2}px;
			background: rgba(15,23,42,0.85);
			box-shadow: 0 ${o * 0.15}px ${o * 0.6}px rgba(0,0,0,0.5);
		`
	}

	const routeBarFillStyle = (bar: RouteBar) => {
		const o = (5 * cellHeight) / 60
		const barHeight = o * 1.3
		const barWidth = cellWidth - o * 2
		const inset = barHeight * 0.18
		const [light, dark] = healthBands(bar.percentage)
		return `
			left: ${bar.xOffset + o + inset}px;
			top: ${bar.yOffset + cellHeight - barHeight - o + inset}px;
			width: ${Math.max(0, (barWidth - inset * 2) * bar.percentage)}px;
			height: ${barHeight - inset * 2}px;
			border-radius: ${(barHeight - inset * 2) / 2}px;
			background: linear-gradient(to bottom, ${light}, ${dark});
		`
	}

	const animationDirection = [
		{ x: cellWidth },
		{ y: cellHeight },
		{ x: -cellWidth },
		{ y: -cellHeight },
	]

	$: traverseRoute($routeAnimation?.route ?? null)

	$: setTimeout(() => {
		index
		hideNewInstance = false
	}, ANIMATION_TIME)
</script>

{#if $routeAnimation && routeVisible($routeAnimation, $viewerVisibility, $viewerTeam, index)}
	{@const route = $routeAnimation}
	{#key index}
		{@const flyParams = {
			...animationDirection[getDirection(route.map, route.route, index - 1)],
			duration: ANIMATION_TIME,
			easing: linear,
			opacity: 1,
		}}
		{@const bar = parseRouteHealth(route)}
		{@const alpha = hideNewInstance ? 0 : routeOpacity(route, $viewerTeam, index)}
		<div
			class="absolute overflow-clip"
			style={`${render(parseRoute(route), $animationFrame)} opacity: ${alpha};`}
			out:fly={flyParams}
		>
			{#if bar}
				<div class="absolute" style={routeBarTrackStyle(bar)}></div>
				<div class="absolute" style={routeBarFillStyle(bar)}></div>
			{/if}
		</div>
	{/key}
{/if}

{#each $animations as animation (animation.key)}
	{#if tileVisible(animation.tile, $viewerVisibility)}
		<div
			class="absolute overflow-clip"
			style={render(animation, $overlayFrame - animation.startingFrame)}
		></div>
	{/if}
{/each}
