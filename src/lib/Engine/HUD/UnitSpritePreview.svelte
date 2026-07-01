<script lang="ts">
	import { onDestroy, onMount } from 'svelte'
	import { unitData } from '$lib/GameData/unit'

	/** Idle sprite sheet for this unit/team (from `spriteStore.units[type][team]`). */
	export let image: HTMLImageElement | undefined = undefined
	export let type: number
	/** Rendered box size in CSS px. */
	export let size = 40
	/** When true, slowly cycle through the unit's four facing directions. */
	export let rotate = false

	// The idle sheet is laid out columns = facing direction (`state`), rows =
	// animation frame — identical to the in-game `renderObject` mapping. We only
	// ever draw frame 0 of a direction, so a single still cleanly shows the unit
	// (the old build menu stretched the *whole* sheet into the box, slicing the
	// unit apart).
	const SPRITE = 60
	$: meta = unitData[type]
	$: frameWidth = SPRITE + (meta?.xOffset ?? 0)
	$: frameHeight = SPRITE + (meta?.yOffset ?? 0)

	let canvas: HTMLCanvasElement | undefined
	let direction = 0
	let timer: ReturnType<typeof setInterval> | null = null

	const draw = () => {
		if (!canvas) return
		const ctx = canvas.getContext('2d')
		if (!ctx) return
		ctx.clearRect(0, 0, size, size)
		if (!image || !image.complete || image.naturalWidth === 0) return
		ctx.imageSmoothingEnabled = false

		const columns = Math.max(1, Math.round(image.naturalWidth / frameWidth))
		const col = direction % columns

		// Show only the unit's on-tile footprint: the bottom SPRITE×SPRITE block of the
		// frame. A tall unit (yOffset > 0, e.g. the Annihilator Tank at 60×120) carries
		// extra "headroom" above that footprint — the part that, on the map, bleeds up
		// into the tile above. Drawing the whole frame in a square icon either shrinks
		// the unit to a dot (aspect preserved) or stretches it (aspect broken), so we
		// crop the headroom away and scale just the footprint to fill the icon. Every
		// unit, big or small, then renders at the same consistent size; the headroom is
		// simply not shown here.
		const footX = col * frameWidth + (frameWidth - SPRITE) / 2
		const footY = frameHeight - SPRITE
		ctx.drawImage(image, footX, footY, SPRITE, SPRITE, 0, 0, size, size)
	}

	const stopRotation = () => {
		if (timer) {
			clearInterval(timer)
			timer = null
		}
	}

	$: {
		if (rotate) {
			if (!timer) {
				timer = setInterval(() => {
					direction = (direction + 1) % 4
					draw()
				}, 350)
			}
		} else {
			stopRotation()
			direction = 0
			draw()
		}
	}

	// Redraw when the inputs that affect the frame change. Sprites are normally
	// preloaded before the build menu opens, but guard the race where the image is
	// still decoding by redrawing once it finishes.
	$: {
		void [image, frameWidth, frameHeight, size]
		draw()
		if (image && !image.complete) image.addEventListener('load', draw, { once: true })
	}

	onMount(draw)

	onDestroy(stopRotation)
</script>

<canvas
	bind:this={canvas}
	width={size}
	height={size}
	style="width: {size}px; height: {size}px; image-rendering: pixelated;"
></canvas>
