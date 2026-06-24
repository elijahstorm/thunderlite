<script lang="ts">
	import MapRender from './MapRender.svelte'
	import GameSettings from './GameSettings.svelte'
	import { rendererStore } from '$lib/Sprites/spriteStore'
	import { writable } from 'svelte/store'
	import { onMount } from 'svelte'
	import type { CutsceneScript } from '$lib/Campaign/cutsceneTypes'
	import { parseCutsceneScript } from '$lib/Campaign/cutsceneScript'
	import { gameState } from '$lib/Engine/gameState'
	import {
		viewerTeam,
		toggleAllThreats,
		clearThreatOverlay,
	} from '$lib/Engine/threatOverlay'

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

	// An explicit `campaign` (the campaign-mode level scripts) always wins.
	// Otherwise fall back to the map's own authored script (editor maps embed
	// their cutscene DSL in `map.script`), parsing defensively so a malformed
	// script never bricks the board — it just plays without scripting.
	const parseMapScript = (source?: string): CutsceneScript | undefined => {
		if (!source || source.trim() === '') return undefined
		try {
			return parseCutsceneScript(source)
		} catch {
			return undefined
		}
	}
	$: resolvedCampaign = campaign ?? parseMapScript(map.script)

	// The threat overlay is drawn from the local player's vantage point — keep the
	// shared store in step with this board's viewer.
	$: viewerTeam.set(localTeam)

	// Each turn handoff reshuffles enemy positions, so the captured set of shown
	// units would be stale. Clear it so the player re-assesses from a clean slate
	// (one keypress / toggle brings the whole danger map back).
	let lastTurn = -1
	$: if ($gameState.turnNumber !== lastTurn) {
		lastTurn = $gameState.turnNumber
		clearThreatOverlay()
	}

	// `t` toggles the whole enemy-range overlay on/off. Ignored while typing in a
	// field so it never fights chat / name inputs elsewhere on the page.
	const isTyping = (target: EventTarget | null): boolean => {
		const el = target as HTMLElement | null
		if (!el) return false
		const tag = el.tagName
		return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
	}
	const onKeydown = (event: KeyboardEvent) => {
		if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
		if (isTyping(event.target)) return
		if (event.key === 't' || event.key === 'T') {
			event.preventDefault()
			toggleAllThreats(map)
		}
	}
	onMount(() => {
		window.addEventListener('keydown', onKeydown)
		return () => {
			window.removeEventListener('keydown', onKeydown)
			clearThreatOverlay()
		}
	})
</script>

<MapRender
	{map}
	{select}
	{requestRedraw}
	{fogOfWar}
	campaign={resolvedCampaign}
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
