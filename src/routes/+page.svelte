<script lang="ts">
	import { PUBLIC_GAME_NAME } from '$env/static/public'
	import RenderSettings from '$lib/Scroller/RenderSettings.svelte'
	import Scroller from '$lib/Scroller/Scroller.svelte'
	import type { Scroller as ScrollerType } from '$lib/Scroller/Scroller'

	let scroller: ScrollerType

	const paint =
		(context: CanvasRenderingContext2D) =>
		(
			row: number,
			col: number,
			left: number,
			top: number,
			width: number,
			height: number,
			zoom: number
		) => {
			context.save()
			context.translate(left, top)

			context.fillStyle = (row % 2) + (col % 2) > 0 ? '#ddd' : '#fff'
			context.fillRect(0, 0, width, height)

			context.fillStyle = 'green'
			context.font = (14 * zoom).toFixed(2) + 'px "Helvetica Neue", Helvetica, Arial, sans-serif'

			context.fillText(`${row}, ${col}`, 6 * zoom, 18 * zoom)

			context.restore()
		}
</script>

<svelte:head>
	<title>{PUBLIC_GAME_NAME}</title>
</svelte:head>

<div class="flex gap-2 p-6 h-screen">
	<div class="border-4 border-black flex-grow">
		<Scroller bind:scroller {paint} />
	</div>

	<div class="border-black border-4 p-4">
		<RenderSettings {scroller} />
	</div>
</div>
