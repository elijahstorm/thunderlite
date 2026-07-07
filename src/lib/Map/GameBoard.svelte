<script lang="ts">
	import MapRender from './MapRender.svelte'
	import GameSettings from './GameSettings.svelte'
	import { rendererStore } from '$lib/Sprites/spriteStore'
	import { writable } from 'svelte/store'
	import { onMount } from 'svelte'
	import type { CutsceneScript } from '$lib/Campaign/cutsceneTypes'
	import { parseCutsceneScript } from '$lib/Campaign/cutsceneScript'
	import { gameState } from '$lib/Engine/gameState'
	import { viewerTeam, toggleAllThreats, clearThreatOverlay } from '$lib/Engine/threatOverlay'

	interface Props {
		/**
		 * The single presentation wrapper for a live game board. Every gameplay route
		 * (online play, campaign, …) renders through this so the framing stays
		 * consistent: the shared `game-backdrop` and the in-game settings menu (mute /
		 * give up / exit) both live here in one place. The corner overview minimap is
		 * part of the HUD stack (see HUDRoot) so it can't overlap the other HUD chrome.
		 */
		map: MapObject
		select?: ((x: number, y: number) => void) | undefined
		requestRedraw?: number
		fogOfWar?: boolean
		campaign?: CutsceneScript | undefined
		localTeam?: number
		/** Where "Exit to menu" navigates for this context. */
		menuHref?: string
	}

	let {
		map,
		select = undefined,
		requestRedraw = 0,
		fogOfWar = false,
		campaign = undefined,
		localTeam = 0,
		menuHref = '/',
	}: Props = $props()

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
	let resolvedCampaign = $derived(campaign ?? parseMapScript(map.script))

	// The threat overlay is drawn from the local player's vantage point — keep the
	// shared store in step with this board's viewer.
	$effect.pre(() => {
		viewerTeam.set(localTeam)
	})

	// The threat overlay is keyed by unit object reference (see threatOverlay.ts):
	// it follows each enemy as it moves and self-heals when a unit dies or slips
	// into fog, so it stays accurate across turn handoffs without being cleared.
	// Wiping it on every turn change would drop the player's intentional selection
	// right when they want to re-assess the danger map at the start of their turn.

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

<GameSettings {map} {localTeam} {menuHref} />
