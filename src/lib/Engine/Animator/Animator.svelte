<script lang="ts">
	import { ROUTE_SPEED, animateRoute, animations, getDirection, startIncrementer } from './animator'
	import { unitData } from '$lib/GameData/unit'
	import { animationFrame } from '$lib/Sprites/animationFrameCount'
	import { rendererStore } from '$lib/Sprites/spriteStore'
	import { fly } from 'svelte/transition'
	import { linear } from 'svelte/easing'

	export let offset: { x: number; y: number }
	export let cellWidth = 60
	export let cellHeight = 60

	let index = 0
	let hideNewInstance = false

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

	const parseRoute = (route: typeof $animateRoute) => {
		if (route === null) return null
		const { x, y } = tileToXY(route.map, route.route[index])
		const unit = unitData[route.unit.type]
		return {
			source: $rendererStore.units[route.unit.type].sprite[route.unit.team]?.src,
			x,
			y,
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
			width?: number
			height?: number
			frames: number
			state: number
			states?: number
		} | null,
		frame: number
	) => {
		if (animation === null) return ''
		const {
			x,
			y,
			source,
			xOffset,
			yOffset,
			width = cellWidth + xOffset,
			height = cellHeight + yOffset,
			frames,
			state,
			states = 6,
		} = animation
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

	const animationDirection = [
		{ x: cellWidth },
		{ y: cellHeight },
		{ x: -cellWidth },
		{ y: -cellHeight },
	]

	$: traverseRoute($animateRoute?.route ?? null)

	$: setTimeout(() => {
		index
		hideNewInstance = false
	}, ROUTE_SPEED)
</script>

{#if $animateRoute}
	{#key index}
		<div
			class="absolute overflow-clip"
			class:opacity-0={hideNewInstance}
			style={render(parseRoute($animateRoute), $animationFrame)}
			out:fly={{
				...animationDirection[getDirection($animateRoute.map, $animateRoute.route, index - 1)],
				duration: ROUTE_SPEED,
				easing: linear,
				opacity: 1,
			}}
		/>
	{/key}
{/if}

{#each $animations as animation (animation.key)}
	<div
		class="absolute overflow-clip"
		style={render(animation, $animationFrame - animation.startingFrame)}
	/>
{/each}
