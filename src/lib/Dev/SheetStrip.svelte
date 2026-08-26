<script lang="ts">
	// A run of columns lifted straight out of a terrain sheet, at one variant and
	// frame. Shows the art as drawn, with none of the autotiler's choices in the
	// way — so a wrong-looking tile can be pinned on the frame that was picked or
	// on the frame itself.
	import { sheetImage, sheetsLoaded } from '$lib/Dev/devSheets.svelte'

	interface Props {
		url: string
		from: number
		to: number
		row: number
		cell?: number
	}
	let { url, from, to, row, cell = 60 }: Props = $props()

	const SPRITE = 60
	let canvas = $state<HTMLCanvasElement>()
	let count = $derived(to - from + 1)

	$effect(() => {
		sheetsLoaded()
		const context = canvas?.getContext('2d')
		const image = sheetImage(url)
		if (!context) return
		context.imageSmoothingEnabled = false
		context.clearRect(0, 0, count * cell, cell)
		if (!image) return
		for (let i = 0; i < count; i += 1)
			context.drawImage(
				image,
				(from + i) * SPRITE,
				row * SPRITE,
				SPRITE,
				SPRITE,
				i * cell,
				0,
				cell,
				cell
			)
	})
</script>

<canvas
	bind:this={canvas}
	width={count * cell}
	height={cell}
	style="image-rendering: pixelated;"
></canvas>
