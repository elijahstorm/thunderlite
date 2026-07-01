<script lang="ts">
	import { onDestroy } from 'svelte'
	import Animator from '$lib/Engine/Animator/Animator.svelte'
	import { animationFrame } from '$lib/Sprites/animationFrameCount'
	import { interactionState } from '$lib/Engine/Interactor/interactionState'
	import { setBoardGeometry, clearBoardGeometry } from '$lib/Engine/HUD/boardGeometry'
	import { campaignScriptActive } from '$lib/Campaign/scriptGate'
	import { boardBusy } from '$lib/Engine/Animator/animator'

	export let interfacer: InterfaceInteraction
	export let select: (x: number, y: number) => void
	export let hover: (x: number, y: number) => void
	export let validTile: (x: number, y: number) => boolean
	export let canSelectAt: (x: number, y: number) => boolean = () => true
	export let mini: boolean = false
	export let editor: boolean = false
	export let animator: typeof Animator = Animator

	const cellWidth = mini ? 20 : 60
	const cellHeight = cellWidth

	const handleClick = (_x: number, _y: number) => {
		const [x, y] = [tileX(_x), tileY(_y)]
		if (!validTile(x, y)) return
		select(x, y)
		interfacer.selected = { x, y }
	}
	const handleHover = (_x: number, _y: number) => {
		const [x, y] = [tileX(_x), tileY(_y)]
		if (!validTile(x, y)) return
		if (interfacer.hover.x === x && interfacer.hover.y === y) return
		hover(x, y)
		interfacer.hover = { x, y }
	}
	// Only the live gameplay board publishes its screen geometry — the editor and
	// minimap never host the post-move ActionMenu, so they'd only fight over the
	// shared store (and the minimap's tiny cells would mis-anchor it).
	const publishesGeometry = !mini && !editor
	let section: HTMLElement | undefined

	const publishGeometry = () => {
		if (!publishesGeometry || !section) return
		const rect = section.getBoundingClientRect()
		setBoardGeometry({
			originLeft: rect.left - interfacer.offset.x,
			originTop: rect.top - interfacer.offset.y,
			cellWidth,
			cellHeight,
		})
	}

	const handleOffset = (x: number, y: number, zoom: number) => {
		interfacer.offset = { x, y, zoom }
		publishGeometry()
	}

	onDestroy(() => {
		if (publishesGeometry) clearBoardGeometry()
	})
	const handleKeypress = (_key: string, _shiftKey: boolean) => {
		interfacer.key.key = _key
		interfacer.key.shift = _shiftKey
	}

	const tileX = (x: number) => Math.floor(x / cellWidth)
	const tileY = (y: number) => Math.floor(y / cellHeight)

	const position: (tile: { x: number; y: number }) => string = ({ x, y }) =>
		`left: ${x * cellWidth - interfacer.offset.x}px; top: ${
			y * cellHeight - interfacer.offset.y
		}px; width: ${cellWidth}px; height: ${cellHeight}px;`
</script>

<svelte:window on:resize={publishGeometry} />

<section bind:this={section} class="grid relative w-full h-full overflow-hidden">
	<div class="col-start-1 row-start-1 cursor-pointer">
		<slot {handleClick} {handleHover} {handleKeypress} {handleOffset} {cellWidth} {cellHeight}
		></slot>
	</div>

	{#if !editor}
		<div class="col-start-1 row-start-1 pointer-events-none">
			<svelte:component this={animator} offset={interfacer.offset} {cellWidth} {cellHeight} />
		</div>
	{/if}

	{#if !mini && !editor}
		<div class="col-start-1 row-start-1 pointer-events-none">
			{#if $interactionState === 'select' && !$campaignScriptActive && !$boardBusy && canSelectAt(interfacer.hover.x, interfacer.hover.y)}
				<!-- hover.png is a 60x120 two-frame vertical strip. We flip frames off the
				     shared `animationFrame` clock (the same 200ms beat tile-select rides),
				     so the hover marker stays in phase no matter when hovering begins. -->
				<div
					class="absolute hover-marker"
					style={`${position(interfacer.hover)} background-position-y: ${
						$animationFrame % 2 ? '100%' : '0%'
					};`}
					aria-label="hovered tile"
				></div>
			{/if}
		</div>
	{/if}
</section>

<style>
	/* The strip stacks two 60x60 frames vertically (image is 60x120). Scaling the
	   background to 200% height lets us show one frame at a time; which frame is
	   shown is driven inline from the shared animation clock, not a CSS keyframe,
	   so the pulse stays in phase with the board's other tile animations. */
	.hover-marker {
		background-image: url('/game/play/icon/move/hover.png');
		background-repeat: no-repeat;
		background-size: 100% 200%;
	}
</style>
