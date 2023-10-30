<script lang="ts">
	import {
		ANIMATION_TIME,
		routeAnimation,
		animations,
		getDirection,
		startIncrementer,
	} from './animator'
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

	const parseRoute = (route: typeof $routeAnimation) => {
		if (route === null) return null
		const { x, y } = tileToXY(route.map, route.route[index])
		const unit = unitData[route.unit.type]
		return {
			x,
			y,
			source: $rendererStore.units[route.unit.type].sprite[route.unit.team]?.src,
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

{#if $routeAnimation}
	{#key index}
		<div
			class="absolute overflow-clip"
			class:opacity-0={hideNewInstance}
			style={render(parseRoute($routeAnimation), $animationFrame)}
			out:fly={{
				...animationDirection[getDirection($routeAnimation.map, $routeAnimation.route, index - 1)],
				duration: ANIMATION_TIME,
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
