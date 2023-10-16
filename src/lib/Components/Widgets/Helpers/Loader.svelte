<script lang="ts">
	import {
		Jumper,
		Firework,
		Chasing,
		Jellyfish,
		Wave,
		Circle2,
		Clock,
		Stretch,
		SyncLoader,
		BarLoader,
	} from 'svelte-loading-spinners'

	export let size: number = 3
	export let top: number = 0
	export let right: number = 0
	export let bottom: number = 0
	export let left: number = 0

	const loaders = [
		Jumper,
		Firework,
		Chasing,
		Jellyfish,
		Wave,
		Circle2,
		Clock,
		Stretch,
		SyncLoader,
		BarLoader,
	]

	let style = ''
	$: style = `padding: ${[top, right, bottom, left].map((p) => `${p}rem`).join(' ')};`
</script>

<div class="m-auto w-12 h-12" {style}>
	<svelte:component
		this={loaders[Math.floor(Math.random() * loaders.length)]}
		size={size + 'rem'}
	/>
</div>
