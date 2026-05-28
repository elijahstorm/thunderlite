<script lang="ts">
	import MapRender from './MapRender.svelte'
	import GameSettings from './GameSettings.svelte'
	import { rendererStore } from '$lib/Sprites/spriteStore'
	import { writable } from 'svelte/store'
	import type { CutsceneScript } from '$lib/Campaign/cutsceneTypes'

	/**
	 * The single presentation wrapper for a live game board. Every gameplay route
	 * (online play, campaign, …) renders through this so the framing stays
	 * consistent: the shared `game-backdrop`, the optional corner minimap, and the
	 * in-game settings menu (mute / give up / exit) all live here in one place.
	 */
	export let map: MapObject
	export let select: ((x: number, y: number) => void) | undefined = undefined
	export let requestRedraw = 0
	export let fogOfWar = false
	export let campaign: CutsceneScript | undefined = undefined
	export let localTeam = 0
	/** Show the dimmed, hover-to-reveal overview map in the corner. */
	export let minimap = false
	/** Where "Exit to menu" navigates for this context. */
	export let menuHref = '/'

	const contextLoaded = writable(!!$rendererStore.ground[0]?.sprite)
</script>

<MapRender
	{map}
	{select}
	{requestRedraw}
	{fogOfWar}
	{campaign}
	{localTeam}
	{contextLoaded}
	backdrop="game-backdrop"
/>

{#if minimap && $contextLoaded}
	<div
		class="fixed right-3 top-3 overflow-hidden rounded-xl border border-border-strong opacity-40 shadow-lg ring-1 ring-black/5 backdrop-blur-sm transition-opacity duration-200 hover:opacity-100"
	>
		<MapRender mini pause {fogOfWar} {map} {contextLoaded} backdrop="bg-surface-2" />
	</div>
{/if}

<GameSettings {map} {localTeam} {menuHref} />
