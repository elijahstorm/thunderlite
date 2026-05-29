<script lang="ts">
	import { onMount } from 'svelte'
	import { terrainRenderer } from '$lib/GameData/terrain'
	import { skyRenderer } from '$lib/GameData/sky'
	import { attacksRenderer, unitData, unitRenderer } from '$lib/GameData/unit'
	import { buildingRenderer } from '$lib/GameData/building'
	import { rendererStore } from '$lib/Sprites/spriteStore'
	import type { imageColorizer } from '$lib/Sprites/imageColorizer'
	import type { createImageLoader } from '$lib/Sprites/images'
	import { animationData, animationRenderer } from '$lib/GameData/animation'
	import { gameState } from './gameState'
	import { onMatchEnd } from './matchEnd'
	import { createCampaignRunner } from '$lib/Campaign/campaignRunner'
	import { createCampaignInterface } from '$lib/Campaign/campaignInterface'
	import Dialogue from '$lib/Campaign/Dialogue.svelte'
	import type { CutsceneScript } from '$lib/Campaign/cutsceneTypes'

	export let map: MapObject
	export let colorizer: ReturnType<typeof imageColorizer>
	export let makeImage: ReturnType<typeof createImageLoader>
	export let select = (x: number, y: number) => {}
	/** When set, this level is a scripted campaign level (K1 parse output). */
	export let campaign: CutsceneScript | undefined = undefined

	let validTile = (x: number, y: number) => x < map.cols && y < map.rows

	const interfacer: InterfaceInteraction = (() => {
		return {
			selected: { x: -1, y: -1 },
			hover: { x: -1, y: -1 },
			offset: { x: 0, y: 0, zoom: 1 },
			key: { key: '', shift: false },
		}
	})()

	let renderData: ObjectRenderer = {
		ground: (type: number) => $rendererStore.ground[type],
		sky: (type?: number) =>
			typeof type !== 'undefined' ? ($rendererStore.sky[type] ?? null) : null,
		unit: (type?: number) =>
			typeof type !== 'undefined' ? ($rendererStore.units[type] ?? null) : null,
		building: (type?: number) =>
			typeof type !== 'undefined' ? ($rendererStore.buildings[type] ?? null) : null,
		animation: (type: number) => $rendererStore.animation[type] ?? null,
	}

	onMount(() => {
		const [ground, sky, units, attacks, buildings, animation] = [
			terrainRenderer,
			skyRenderer,
			unitRenderer,
			attacksRenderer,
			buildingRenderer,
			animationRenderer,
		].map((renderer) => renderer(makeImage, colorizer))

		rendererStore.update((store) => ({
			ground: { ...store.ground, ...ground(map.filters.ground(map.layers.ground)) },
			sky: { ...store.sky, ...sky(map.filters.sky(map.layers.sky)) },
			units: { ...store.units, ...units(map.filters.units(map.layers.units)) },
			// Preload every unit type's attack sprite, not just the ones standing on
			// the initial map. Factories can build types that weren't placed at start,
			// and even initial-map types race the player's first attack; warming the
			// cache here avoids the brief "unit disappears" gap when the overlay
			// fires before its image has decoded.
			attacks: { ...store.attacks, ...attacks(unitData.map((_, index) => index)) },
			buildings: {
				...store.buildings,
				...buildings(map.filters.buildings(map.layers.buildings)),
			},
			animation: { ...store.animation, ...animation(animationData.map((_, index) => index)) },
		}))
	})

	// Campaign layer (K2): when a scripted level is active, drive its script
	// against the live engine. `start` runs on mount; each new side-turn fires
	// its `turns[round][team]` block once; the J1 match-end hook plays
	// `win`/`lose`. Between scripted beats the player keeps normal control of
	// the match. Round and team are zero-based; the engine's 1-based
	// `turnNumber` is translated here so script authors can write `<turn 0,1>`
	// for "CPU's first turn".
	onMount(() => {
		if (!campaign) return

		const runner = createCampaignRunner(campaign, createCampaignInterface({ map }))
		void runner.start()

		let lastKey = ''
		const offTurn = gameState.subscribe((state) => {
			const round = state.turnNumber - 1
			const team = state.currentTeam
			const key = `${round}:${team}`
			if (key !== lastKey) {
				lastKey = key
				void runner.enterTurn(round, team)
			}
		})
		const offMatchEnd = onMatchEnd((result) => void runner.finish(result))

		return () => {
			offTurn()
			offMatchEnd()
		}
	})
</script>

<slot {interfacer} {select} {validTile} {renderData}></slot>

{#if campaign}
	<Dialogue />
{/if}
