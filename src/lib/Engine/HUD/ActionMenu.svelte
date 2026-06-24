<script lang="ts">
	import { onDestroy, onMount } from 'svelte'
	import { fade, fly, scale } from 'svelte/transition'
	import { cubicOut } from 'svelte/easing'
	import { actionMenuState } from './actionMenuStore'
	import { boardGeometry } from './boardGeometry'
	import { performMenuAction, peekMenu, cancelMenu } from '../Interactor/interactor'
	import type { ActionMenuItemId } from '../actions'

	export let map: MapObject | undefined = undefined

	$: menu = $actionMenuState
	$: geo = $boardGeometry

	const labels: Record<ActionMenuItemId, string> = {
		attack: 'Attack',
		capture: 'Capture',
		mine: 'Mine',
		build: 'Build',
		repair: 'Repair',
		transport: 'Transport',
		ship_out: 'Ship Out',
		air_lift: 'Air Lift',
		land: 'Land',
		wait: 'Wait',
	}

	// Pace at which the action buttons cascade in. Each button is delayed by its
	// index, so the list visibly "grows" out of the unit the player just moved
	// rather than snapping in all at once.
	const STAGGER_MS = 55
	const ITEM_DURATION = 220

	// Viewport size (kept live) so the panel can clamp itself fully on-screen.
	let vw = 0
	let vh = 0

	// The rendered panel's box, measured so placement math knows how much room it
	// needs before deciding which side of the unit to sit on.
	let panelW = 0
	let panelH = 0

	// On-screen box of the unit's tile, derived from the board geometry the main
	// TileSelector publishes as the camera moves. Tracks both the open menu and the
	// "peek" state, so the focus ring keeps marking the pending unit while the
	// player looks around. Null until the board + a (open or peeking) menu exist —
	// the fallback below then centres the panel.
	$: tileBox =
		geo && (menu.open || menu.peeking) && menu.unitTile != null && map
			? {
					left: geo.originLeft + (menu.unitTile % map.cols) * geo.cellWidth,
					top: geo.originTop + Math.floor(menu.unitTile / map.cols) * geo.cellHeight,
					w: geo.cellWidth,
					h: geo.cellHeight,
				}
			: null

	const MARGIN = 12
	const GAP = 14

	// Anchor the panel beside the unit: prefer its right flank, fall back to the
	// left when that would run off-screen, then clamp vertically around the tile's
	// centre. `side` feeds the cascade direction so buttons fly *out from* the unit.
	$: placement = (() => {
		if (!tileBox || !vw || !vh || !panelW || !panelH) {
			return { left: null as number | null, top: null as number | null, side: 'right' as const }
		}
		const tileCenterY = tileBox.top + tileBox.h / 2
		let side: 'right' | 'left' = 'right'
		let left = tileBox.left + tileBox.w + GAP
		if (left + panelW > vw - MARGIN) {
			side = 'left'
			left = tileBox.left - GAP - panelW
		}
		left = Math.max(MARGIN, Math.min(left, vw - panelW - MARGIN))
		let top = tileCenterY - panelH / 2
		top = Math.max(MARGIN, Math.min(top, vh - panelH - MARGIN))
		return { left, top, side }
	})()

	$: anchored = placement.left != null && placement.top != null
	$: flyFrom = placement.side === 'left' ? 18 : -18

	const handleSelect = (id: ActionMenuItemId) => {
		if (!map) return
		performMenuAction(map, id)
	}

	// Dismissing the menu (eye button, backdrop, Escape) drops into "peek" mode —
	// it hides the panel and veil so the player can study the board, but leaves the
	// unit's choice intact. A tap on the board re-summons the menu. The unit is NOT
	// silently waited; the player keeps every option.
	const handlePeek = () => {
		peekMenu()
	}

	// A unit that hasn't moved yet committed nothing, so its menu offers a true
	// cancel: close the panel and deselect the unit outright. It is NOT idled — it
	// stays free to act this turn. The post-move menu has no such escape (the move
	// already happened), so there we fall back to peeking.
	const handleDismiss = () => {
		if (menu.moved) {
			handlePeek()
		} else {
			cancelMenu()
		}
	}

	const onKey = (evt: KeyboardEvent) => {
		if (!menu.open) return
		if (evt.key === 'Escape') {
			evt.preventDefault()
			handleDismiss()
		}
	}

	onMount(() => {
		if (typeof window !== 'undefined') window.addEventListener('keydown', onKey)
	})
	onDestroy(() => {
		if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey)
	})
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} />

<!-- A pulsing ring drawn straight over the moved unit, tying the action list
     back to the tile the player just acted on. It persists through "peek" mode
     (panel hidden, board free) so the player never loses track of which unit is
     still awaiting a decision. pointer-events-none keeps the board draggable. -->
{#if tileBox}
	<div
		class="pointer-events-none fixed z-55"
		style="left: {tileBox.left}px; top: {tileBox.top}px; width: {tileBox.w}px; height: {tileBox.h}px;"
		transition:fade={{ duration: 200 }}
	>
		<div class="action-focus-ring h-full w-full rounded-md"></div>
	</div>
{/if}

{#if menu.open}
	<!-- A light, fading veil — kept translucent so the board (and the unit that
	     triggered the menu) stays visible underneath. Clicking it peeks. -->
	<button
		type="button"
		class="fixed inset-0 z-54 cursor-default bg-black/25"
		aria-label={menu.moved ? 'Dismiss menu and look around' : 'Cancel and deselect unit'}
		data-testid="action-menu-backdrop"
		on:click={handleDismiss}
		transition:fade={{ duration: 180 }}
	></button>

	<div
		class="fixed z-56 {anchored ? '' : 'inset-0 flex items-center justify-center'}"
		style={anchored ? `left: ${placement.left}px; top: ${placement.top}px;` : ''}
		data-testid="action-menu"
		role="dialog"
		aria-modal="true"
	>
		<div
			class="min-w-48 rounded-lg border border-white/10 bg-neutral-900/95 p-2 text-white shadow-2xl ring-1 ring-black/40 backdrop-blur-sm"
			bind:clientWidth={panelW}
			bind:clientHeight={panelH}
			in:scale={{ duration: 160, start: 0.9, opacity: 0, easing: cubicOut }}
			out:scale={{ duration: 120, start: 0.95, opacity: 0, easing: cubicOut }}
		>
			<div class="mb-1.5 flex items-center justify-between px-1">
				<h2 class="font-mono text-xs uppercase tracking-wider text-white/60">Actions</h2>
				<button
					type="button"
					class="flex h-5 w-5 items-center justify-center rounded text-white/50 hover:bg-white/10 hover:text-white"
					data-testid="action-menu-cancel"
					aria-label={menu.moved ? 'Look around the map' : 'Cancel and deselect unit'}
					title={menu.moved
						? 'Look around: tap the board to bring the menu back'
						: 'Cancel: deselect this unit without using its turn'}
					on:click={handleDismiss}
				>
					{#if menu.moved}
						<svg
							class="h-3.5 w-3.5"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
							<circle cx="12" cy="12" r="3" />
						</svg>
					{:else}
						<svg
							class="h-3.5 w-3.5"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M18 6 6 18" />
							<path d="m6 6 12 12" />
						</svg>
					{/if}
				</button>
			</div>

			<div class="flex flex-col gap-1">
				{#each menu.items as item, i (item.id)}
					<button
						type="button"
						class="rounded bg-neutral-800/80 px-3 py-2 text-left font-mono text-sm text-white/90 transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-neutral-800/80"
						data-testid={`action-menu-${item.id}`}
						disabled={!item.enabled}
						title={item.reason ?? labels[item.id]}
						on:click={() => handleSelect(item.id)}
						in:fly={{ x: flyFrom, y: 4, duration: ITEM_DURATION, delay: i * STAGGER_MS, easing: cubicOut }}
					>
						{labels[item.id]}
						{#if !item.enabled && item.reason}
							<span class="ml-1 text-xs opacity-75">· {item.reason}</span>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.action-focus-ring {
		box-shadow:
			0 0 0 2px rgba(255, 255, 255, 0.85),
			0 0 12px 2px rgba(255, 255, 255, 0.4);
		animation: action-focus-pulse 1.4s ease-in-out infinite;
	}

	@keyframes action-focus-pulse {
		0%,
		100% {
			box-shadow:
				0 0 0 2px rgba(255, 255, 255, 0.85),
				0 0 12px 2px rgba(255, 255, 255, 0.35);
		}
		50% {
			box-shadow:
				0 0 0 3px rgba(255, 255, 255, 0.95),
				0 0 18px 4px rgba(255, 255, 255, 0.55);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.action-focus-ring {
			animation: none;
		}
	}
</style>
