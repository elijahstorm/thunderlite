<script lang="ts">
	import { ANIMATION_TIME, animateRoute, getDirection, startIncrementer } from './animator'
	import { unitData } from '$lib/GameData/unit'
	import { animationFrame } from '$lib/Sprites/animationFrameCount'
	import { rendererStore } from '$lib/Sprites/spriteStore'
	import { fly } from 'svelte/transition'
	import { linear } from 'svelte/easing'

	export let position: (tile: { x: number; y: number }) => string = () => ''

	const spriteSize = 60
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

	const render = (route: typeof $animateRoute, frame: number) => {
		if (route === null) return ''
		const source = $rendererStore.units[route.unit.type].sprite[route.unit.team]?.src
		const unit = unitData[route.unit.type]
		const direction = getDirection(route.map, route.route, index)

		return `background-image: url('${source}'); background-position: -${Math.abs(
			direction * (spriteSize + unit.xOffset)
		)}px -${Math.abs((frame % unit.frames) * (spriteSize + unit.yOffset) + unit.yOffset)}px;`
	}

	const tileToXY = (map: MapObject, tile: number) => ({
		x: tile % map.cols,
		y: Math.floor(tile / map.cols),
	})

	const animationDirection = [{ x: 60 }, { y: 60 }, { x: -60 }, { y: -60 }]

	$: traverseRoute($animateRoute?.route ?? null)

	$: setTimeout(() => {
		index
		hideNewInstance = false
	}, ANIMATION_TIME)
</script>

{#if $animateRoute}
	{#key index}
		<div
			class="absolute overflow-clip"
			class:opacity-0={hideNewInstance}
			style={`
                ${position(tileToXY($animateRoute.map, $animateRoute.route[index]))} 
                ${render($animateRoute, $animationFrame)}
            `}
			out:fly={{
				...animationDirection[getDirection($animateRoute.map, $animateRoute.route, index - 1)],
				duration: ANIMATION_TIME,
				easing: linear,
				opacity: 1,
			}}
		/>
	{/key}
{/if}
