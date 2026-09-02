<script lang="ts">
	import {
		ANIMATION_TIME,
		BLOCKED_ANIMATION_TIME,
		routeAnimation,
		animations,
		blockedAnimation,
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
	import { untrack } from 'svelte'

	interface Props {
		cellWidth?: number
		cellHeight?: number
	}

	let { cellWidth = 60, cellHeight = 60 }: Props = $props()

	let index = $state(0)

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
			},
			() => index < route.length - 1
		)
	}

	// A unit's idle sheet as an overlay sprite seated on cell (x, y), facing `state`.
	// The renderer may be missing (a unit type's sprite hasn't decoded yet, or a
	// headless/test context) — never index into it blindly. A throw here lands
	// inside the render effect and corrupts the whole reactive tree, which reads as
	// "animations freeze and the board snaps to its final state". Bail to null
	// (render() treats that as no overlay) instead.
	const parseUnitSprite = (unit: UnitObject, x: number, y: number, state: number) => {
		const source = $rendererStore.units[unit.type]?.sprite?.[unit.team ?? 0]?.src
		if (!source) return null
		const data = unitData[unit.type]
		return {
			x,
			y,
			source,
			xOffset: data.xOffset,
			yOffset: data.yOffset,
			frames: data.frames,
			state,
		}
	}

	const parseRoute = (route: typeof $routeAnimation) => {
		if (route === null) return null
		const { x, y } = tileToXY(route.map, route.route[index])
		// Face the step the sprite is *currently sliding along* (route[index-1] →
		// route[index]), which is the same direction as its in:fly. Facing the
		// *next* step here would turn the unit the instant it enters a corner tile,
		// so it crabs sideways into the bend before setting off the new way. The
		// turn belongs to the next beat, when the following element slides out.
		const state = getDirection(route.map, route.route, Math.max(0, index - 1))
		return parseUnitSprite(route.unit, x, y, state)
	}

	// --- Blocked lunge ---------------------------------------------------------
	// A move cut short by an enemy the mover couldn't see ends on this beat: the
	// halted unit lunges at the tile it ran into, recoils, an impact flash licks the
	// shared edge, and a "!" callout pops over it. The pieces sit inside one wrapper
	// pinned to the unit's cell — the sprite (and its health bar) lunges, the flash
	// and callout stay put — so nothing is clipped by the sprite's own box.

	// Same vantage rule as a moving unit at one step (`routeVisible`): our own unit
	// always shows, an enemy only where fog and cloak let us see it standing.
	const blockedVisible = (
		bump: typeof $blockedAnimation,
		fog: typeof $viewerVisibility,
		team: number
	) => {
		if (bump === null) return false
		if (bump.unit.team === team) return true
		if (!unitSeenByViewer(fog, bump.tile, bump.unit)) return false
		return !isUnitStealthed(bump.map, bump.tile, bump.unit)
	}

	// Mirrors `routeOpacity`: our own cloaked unit reads at half strength.
	const blockedOpacity = (bump: NonNullable<typeof $blockedAnimation>, team: number) =>
		bump.unit.team === team && isUnitStealthed(bump.map, bump.tile, bump.unit) ? 0.5 : 1

	// Unit vector per facing (right, down, left, up) — the way the lunge goes.
	const LUNGE_VECTORS = [
		[1, 0],
		[0, 1],
		[-1, 0],
		[0, -1],
	] as const
	// How far the lunge carries, as a share of a cell: enough to visibly cross the
	// tile line, short of looking like a step onto the blocked tile.
	const LUNGE_REACH = 0.34

	const blockedWrapperStyle = (bump: NonNullable<typeof $blockedAnimation>, alpha: number) => {
		const { x, y } = tileToXY(bump.map, bump.tile)
		return `
			left: ${x * cellWidth}px;
			top: ${y * cellHeight}px;
			width: ${cellWidth}px;
			height: ${cellHeight}px;
			opacity: ${alpha};
			--beat: ${BLOCKED_ANIMATION_TIME}ms;
		`
	}

	// The sprite is a child of the cell wrapper, so render() is asked for cell
	// (0, 0): that yields exactly the -xOffset/-yOffset seat the sprite needs.
	const blockedSpriteStyle = (bump: NonNullable<typeof $blockedAnimation>, frame: number) => {
		const [dx, dy] = LUNGE_VECTORS[bump.direction] ?? [0, 0]
		return `
			${render(parseUnitSprite(bump.unit, 0, 0, bump.direction), frame)}
			--lunge-x: ${dx * cellWidth * LUNGE_REACH}px;
			--lunge-y: ${dy * cellHeight * LUNGE_REACH}px;
		`
	}

	// A flash on the edge shared with the blocked tile: long along the edge, thin
	// across it, centred on the edge's midpoint.
	const blockedImpactStyle = (bump: NonNullable<typeof $blockedAnimation>) => {
		const [dx, dy] = LUNGE_VECTORS[bump.direction] ?? [0, 0]
		const horizontal = dx !== 0
		const along = (horizontal ? cellHeight : cellWidth) * 0.72
		const across = (horizontal ? cellWidth : cellHeight) * 0.24
		return `
			left: ${cellWidth / 2 + (dx * cellWidth) / 2}px;
			top: ${cellHeight / 2 + (dy * cellHeight) / 2}px;
			width: ${horizontal ? across : along}px;
			height: ${horizontal ? along : across}px;
			margin-left: ${-(horizontal ? across : along) / 2}px;
			margin-top: ${-(horizontal ? along : across) / 2}px;
		`
	}

	const blockedCalloutStyle = () => {
		const size = cellHeight * 0.44
		return `
			left: 50%;
			top: ${-cellHeight * 0.36}px;
			min-width: ${size}px;
			height: ${size}px;
			padding: 0 ${size * 0.22}px;
			border-radius: ${size / 2}px;
			border-width: ${Math.max(1.5, cellHeight * 0.035)}px;
			font-size: ${size * 0.72}px;
		`
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
		// Positioned in *content* coordinates (map space), not screen space: the
		// scroll offset is applied once by the overlay layer's transform (see
		// TileSelector's handleOffset), so every sprite here scrolls with the board as
		// a single unit and animations stay locked to their tile as the map pans.
		return `
			left: ${x * cellWidth - xOffset}px;
			top: ${y * cellHeight - yOffset}px;
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
	// inherits the exact same in:fly transform and glides with the unit instead of
	// snapping tile-to-tile. Coordinates are therefore div-local: the sprite div's
	// box starts at (tileX − xOffset, tileY − yOffset), so the unit's cell sits at
	// (xOffset, yOffset) within it (offsets scaled the same way render() scales them).
	// Geometry below the offsets mirrors paint.ts `playInfo` so the bar lines up with
	// the static canvas bar before and after the move.
	const healthBands = (p: number): [string, string] =>
		p > 0.65 ? ['#86efac', '#22c55e'] : p > 0.35 ? ['#fde047', '#eab308'] : ['#fca5a5', '#ef4444']

	const parseRouteHealth = (route: typeof $routeAnimation) =>
		route === null ? null : parseUnitHealth(route.unit)

	const parseUnitHealth = (unit: UnitObject) => {
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

	type RouteBar = NonNullable<ReturnType<typeof parseUnitHealth>>

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

	// Where the newly-keyed sprite *enters from*: one cell back along its travel
	// direction, so an `in:fly` glides it into the current tile. This is the reverse
	// of the movement vector — a rightward step (dir 0) enters from the left, etc.
	const enterDirection = $derived([
		{ x: -cellWidth },
		{ y: -cellHeight },
		{ x: cellWidth },
		{ y: cellHeight },
	])

	// Depend ONLY on $routeAnimation. `traverseRoute` → `startIncrementer` synchronously
	// calls its terminator `() => index < route.length - 1`, which reads `index`; if that
	// read is tracked, every `index++` step re-runs this effect, resetting `index = 0` and
	// spawning a fresh incrementer — the sprite sticks at the start, then snaps to the end
	// when the overlay clears. (Legacy `$:` tracked only statically-referenced deps, so it
	// never saw `index`.) Run the walk untracked so the incrementer steps cleanly.
	$effect(() => {
		const route = $routeAnimation?.route ?? null
		untrack(() => traverseRoute(route))
	})
</script>

{#if $routeAnimation && routeVisible($routeAnimation, $viewerVisibility, $viewerTeam, index)}
	{@const route = $routeAnimation}
	{#key index}
		{@const flyParams = {
			...enterDirection[getDirection(route.map, route.route, index - 1)],
			duration: ANIMATION_TIME,
			easing: linear,
			opacity: 1,
		}}
		{@const bar = parseRouteHealth(route)}
		{@const alpha = routeOpacity(route, $viewerTeam, index)}
		<div
			class="absolute overflow-clip"
			style={`${render(parseRoute(route), $animationFrame)} opacity: ${alpha};`}
			in:fly={flyParams}
		>
			{#if bar}
				<div class="absolute" style={routeBarTrackStyle(bar)}></div>
				<div class="absolute" style={routeBarFillStyle(bar)}></div>
			{/if}
		</div>
	{/key}
{/if}

{#if $blockedAnimation && blockedVisible($blockedAnimation, $viewerVisibility, $viewerTeam)}
	{@const bump = $blockedAnimation}
	{@const bar = parseUnitHealth(bump.unit)}
	<div class="absolute" style={blockedWrapperStyle(bump, blockedOpacity(bump, $viewerTeam))}>
		<div
			class="blocked-sprite absolute overflow-clip"
			style={blockedSpriteStyle(bump, $animationFrame)}
		>
			{#if bar}
				<div class="absolute" style={routeBarTrackStyle(bar)}></div>
				<div class="absolute" style={routeBarFillStyle(bar)}></div>
			{/if}
		</div>
		<div class="blocked-impact absolute" style={blockedImpactStyle(bump)}></div>
		<div class="blocked-callout absolute" style={blockedCalloutStyle()}>!</div>
	</div>
{/if}

{#each $animations as animation (animation.key)}
	{#if tileVisible(animation.tile, $viewerVisibility)}
		<div
			class="absolute overflow-clip"
			style={render(animation, $overlayFrame - animation.startingFrame)}
		></div>
	{/if}
{/each}

<style>
	/* The halted unit: a sharp lunge at the tile it ran into, a springy recoil
	   past centre, then it settles. Timing functions ride the keyframe they start
	   from — accelerate into the impact, ease out of it. */
	.blocked-sprite {
		animation: blocked-lunge var(--beat) both;
		will-change: transform;
	}
	@keyframes blocked-lunge {
		0% {
			transform: translate(0, 0);
			animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45);
		}
		14% {
			transform: translate(var(--lunge-x), var(--lunge-y));
			animation-timing-function: cubic-bezier(0.2, 0.9, 0.3, 1);
		}
		36% {
			transform: translate(calc(var(--lunge-x) * -0.12), calc(var(--lunge-y) * -0.12));
			animation-timing-function: ease-in-out;
		}
		50%,
		100% {
			transform: translate(0, 0);
		}
	}

	/* A pale flash where the sprite meets the tile line, on the impact beat. */
	.blocked-impact {
		border-radius: 50%;
		background: radial-gradient(
			closest-side,
			rgba(255, 255, 255, 0.95),
			rgba(255, 255, 255, 0.55) 45%,
			rgba(255, 255, 255, 0) 100%
		);
		opacity: 0;
		pointer-events: none;
		animation: blocked-impact calc(var(--beat) * 0.3) calc(var(--beat) * 0.14) both;
	}
	@keyframes blocked-impact {
		0% {
			opacity: 0;
			transform: scale(0.5);
		}
		25% {
			opacity: 0.95;
			transform: scale(1);
		}
		100% {
			opacity: 0;
			transform: scale(1.35);
		}
	}

	/* The callout pops in on the impact beat, holds, and lifts away as the beat
	   ends. Dark pill, white glyph — the same slate the health-bar track uses, so
	   it reads as part of the board rather than a UI toast. */
	.blocked-callout {
		display: flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		color: #fff;
		background: rgba(15, 23, 42, 0.9);
		border-style: solid;
		border-color: rgba(255, 255, 255, 0.92);
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
		font-family:
			ui-sans-serif,
			system-ui,
			-apple-system,
			sans-serif;
		font-weight: 900;
		line-height: 1;
		white-space: nowrap;
		pointer-events: none;
		user-select: none;
		opacity: 0;
		transform-origin: 50% 100%;
		animation: blocked-callout calc(var(--beat) * 0.86) calc(var(--beat) * 0.14) both;
	}
	@keyframes blocked-callout {
		0% {
			opacity: 0;
			transform: translate(-50%, 30%) scale(0.5);
		}
		14% {
			opacity: 1;
			transform: translate(-50%, 0) scale(1.15);
		}
		24% {
			transform: translate(-50%, 0) scale(1);
		}
		78% {
			opacity: 1;
			transform: translate(-50%, 0) scale(1);
		}
		100% {
			opacity: 0;
			transform: translate(-50%, -30%) scale(0.9);
		}
	}
</style>
