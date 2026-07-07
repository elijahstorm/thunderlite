<script lang="ts">
	import { onDestroy } from 'svelte'
	import Animator from '$lib/Engine/Animator/Animator.svelte'
	import { animationFrame } from '$lib/Sprites/animationFrameCount'
	import { interactionState } from '$lib/Engine/Interactor/interactionState'
	import { setBoardGeometry, clearBoardGeometry } from '$lib/Engine/HUD/boardGeometry'
	import { campaignScriptActive } from '$lib/Campaign/scriptGate'
	import { boardBusy } from '$lib/Engine/Animator/animator'

	interface Props {
		interfacer: InterfaceInteraction
		select: (x: number, y: number) => void
		hover: (x: number, y: number) => void
		validTile: (x: number, y: number) => boolean
		canSelectAt?: (x: number, y: number) => boolean
		mini?: boolean
		editor?: boolean
		animator?: typeof Animator
		children?: import('svelte').Snippet<[any]>
	}

	let {
		interfacer = $bindable(),
		select,
		hover,
		validTile,
		canSelectAt = () => true,
		mini = false,
		editor = false,
		animator = Animator,
		children,
	}: Props = $props()

	const cellWidth = $derived(mini ? 20 : 60)
	const cellHeight = $derived(cellWidth)

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
	const publishesGeometry = $derived(!mini && !editor)
	let section: HTMLElement | undefined = $state()

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

	// The DOM overlay layer that hosts the Animator (walk/attack/explosion sprites).
	// Its scroll offset is applied imperatively (below) rather than through a Svelte
	// prop, so it can't fall out of sync with the canvas.
	let animatorLayer: HTMLElement | undefined = $state()

	const handleOffset = (x: number, y: number, zoom: number) => {
		interfacer.offset = { x, y, zoom }
		// Slide the whole overlay layer to match the canvas's scroll position. This
		// runs inside the scroller's own paint loop (the same call that redraws the
		// canvas), so the overlays move in the *same frame* as the board — no
		// one-frame lag, no waiting on a Svelte flush. The Animator's sprites are
		// positioned in content coordinates; this single transform is what maps them
		// into screen space. Doing it here (not as a reactive `offset` prop threaded
		// into each sprite's left/top) is why an attack or move animation tracks the
		// board even when it pans mid-animation, and it never restyles the animating
		// element itself, so the in:fly transition is left untouched.
		if (animatorLayer) animatorLayer.style.transform = `translate3d(${-x}px, ${-y}px, 0)`
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

<svelte:window onresize={publishGeometry} />

<section bind:this={section} class="grid relative w-full h-full overflow-hidden">
	<div class="col-start-1 row-start-1 cursor-pointer">
		{@render children?.({
			handleClick,
			handleHover,
			handleKeypress,
			handleOffset,
			cellWidth,
			cellHeight,
		})}
	</div>

	{#if !editor}
		{@const SvelteComponent = animator}
		<div bind:this={animatorLayer} class="col-start-1 row-start-1 pointer-events-none">
			<SvelteComponent {cellWidth} {cellHeight} />
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
