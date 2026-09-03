<script lang="ts">
	import { onDestroy } from 'svelte'
	import Icon from '@iconify/svelte'
	import MapRender from '$lib/Map/MapRender.svelte'
	import TurnPill from './TurnPill.svelte'
	import PlayerList from './PlayerList.svelte'
	import EndTurnButton from './EndTurnButton.svelte'
	import ResultsButton from './ResultsButton.svelte'
	import TileInfoPanel from './TileInfoPanel.svelte'
	import { gameState } from '../gameState'
	import { setHudGutter, setHudRailWidth, clearHudGutter } from './hudInsets'
	import { panBoardToTile } from '../Animator/animator'

	interface Props {
		map?: MapObject | undefined
		onEndTurn?: () => void
		localTeam?: number
		/** Whether the side holding the turn is one this client commands — passed
		 * straight through to the End Turn button. */
		canEndTurn?: boolean
		/** Show the overview map at the top of the HUD rail. */
		minimap?: boolean
		fogOfWar?: boolean
	}

	let {
		map = undefined,
		onEndTurn = () => {},
		localTeam = 0,
		canEndTurn = true,
		minimap = false,
		fogOfWar = false,
	}: Props = $props()

	// Rail widths in CSS px. These are published as the board's gutter (see
	// hudInsets) *before* the width transition finishes, so the board reflows once
	// to its final size instead of on every frame of the slide — hence real numbers
	// here rather than a measured `clientWidth`.
	const EXPANDED_PX = 264
	const COLLAPSED_PX = 44
	// Below this viewport width an expanded rail would leave too little board to
	// play on, so it floats over the map (with a click-away layer) and the board
	// keeps only the collapsed gutter.
	const OVERLAY_BELOW = 640
	// Viewports at least this wide open the rail by default.
	const AUTO_EXPAND_FROM = 1024
	// Vertical room the overview map may take before it starts scaling down.
	const MINIMAP_MAX_HEIGHT = 176

	let vw = $state(0)
	// `null` until the player works the toggle; the default then follows the
	// viewport. `vw` is 0 for the first frame (svelte:window binds on mount), so
	// treat "not measured yet" as roomy — the rail opens straight away on desktop
	// instead of flashing collapsed.
	let userExpanded = $state<boolean | null>(null)
	let expanded = $derived(userExpanded ?? (vw === 0 || vw >= AUTO_EXPAND_FROM))
	let overlaying = $derived(expanded && vw > 0 && vw < OVERLAY_BELOW)
	let railWidth = $derived(expanded ? EXPANDED_PX : COLLAPSED_PX)

	// Once the match is decided the End Turn slot turns into the Results toggle:
	// the results panel can be put away to look at the board, and this is the way
	// back to it.
	let over = $derived($gameState.phase === 'gameOver')

	// The board reserves exactly this much of its right edge, which is what keeps
	// the rail from swallowing clicks meant for the tiles beneath it.
	$effect(() => {
		setHudGutter(overlaying ? COLLAPSED_PX : railWidth)
		// Overlays reserve less than they paint, so publish the drawn width too:
		// the chat docks anchor off this to stay beside the rail, never under it.
		setHudRailWidth(railWidth)
	})
	onDestroy(clearHudGutter)

	// Scale the overview map so the whole board fits the rail. The mini renderer
	// draws at a fixed cell size unless told otherwise, so a wide or tall map used
	// to overflow its container and get silently cropped — you saw the top-left
	// corner of the map and nothing else.
	const MINI_PADDING = 18
	let miniCell = $derived(
		map
			? Math.max(
					2,
					Math.min(
						20,
						Math.floor((EXPANDED_PX - MINI_PADDING) / Math.max(1, map.cols)),
						Math.floor(MINIMAP_MAX_HEIGHT / Math.max(1, map.rows))
					)
				)
			: 20
	)

	// Click the overview to jump the main camera there. With the board inset the
	// rail is where you look for the wider picture, so it may as well steer.
	const jumpTo = (x: number, y: number) => {
		panBoardToTile(x, y)
	}
</script>

<svelte:window bind:innerWidth={vw} />

{#if overlaying}
	<!-- Click-away layer, so an expanded rail on a small screen can be dismissed
	     by tapping the board rather than hunting for the chevron. -->
	<button
		type="button"
		tabindex="-1"
		aria-label="Collapse the HUD"
		class="fixed inset-0 z-49 cursor-default bg-black/20"
		onclick={() => (userExpanded = false)}
	></button>
{/if}

<!--
	The runtime HUD is a single rail pinned to the right edge, and the board pads
	itself by exactly its width (see hudInsets → MapRender). That is the whole
	point of the rail: the old HUD was a floating top-right stack, so every tile
	underneath it was unreachable — the panel, not the map, got the click. One
	column also means the pieces can never overlap each other however tall the
	tile panel or overview map grows.
-->
<aside
	data-testid="hud-root"
	class="fixed right-0 top-0 z-50 flex h-full flex-col border-l border-white/10 bg-neutral-900/85 text-white shadow-[-10px_0_30px_rgba(0,0,0,0.35)] backdrop-blur-md transition-[width] duration-200 ease-out"
	style="width: {railWidth}px"
>
	<div
		class="flex shrink-0 gap-1 border-b border-white/10 p-2 {expanded
			? 'items-start'
			: 'flex-col items-center'}"
	>
		<button
			type="button"
			class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-white/45 transition-colors hover:bg-white/10 hover:text-white"
			data-testid="hud-collapse"
			aria-expanded={expanded}
			aria-label={expanded ? 'Collapse the HUD' : 'Expand the HUD'}
			title={expanded ? 'Collapse (gives the map more room)' : 'Expand'}
			onclick={() => (userExpanded = !expanded)}
		>
			<Icon icon={expanded ? 'mdi:chevron-right' : 'mdi:chevron-left'} width="18" height="18" />
		</button>
		<TurnPill {localTeam} compact={!expanded} />
	</div>

	{#if expanded}
		{#if minimap && map}
			<div class="shrink-0 border-b border-white/10 p-2">
				<div
					class="mx-auto overflow-hidden rounded-md border border-white/10 shadow-inner"
					style="width: {map.cols * miniCell}px; height: {map.rows * miniCell}px"
				>
					<!-- `localTeam` is not optional here: MapRender defaults it to 0, so
					     the overview map used to draw player 1's fog no matter who was
					     looking at it. -->
					<MapRender
						mini
						pause
						{miniCell}
						{fogOfWar}
						{localTeam}
						{map}
						select={jumpTo}
						backdrop="bg-black/40"
					/>
				</div>
			</div>
		{/if}

		<div class="shrink-0 border-b border-white/10 p-2">
			<PlayerList />
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto p-2">
			<TileInfoPanel {map} {localTeam} />
		</div>

		<div class="shrink-0 border-t border-white/10 p-2">
			{#if over}
				<ResultsButton />
			{:else}
				<EndTurnButton {onEndTurn} {canEndTurn} />
			{/if}
		</div>
	{:else}
		<div class="mt-auto p-1.5">
			{#if over}
				<ResultsButton compact />
			{:else}
				<EndTurnButton {onEndTurn} {canEndTurn} compact />
			{/if}
		</div>
	{/if}
</aside>
