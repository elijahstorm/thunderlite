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
	] as const

	export let type = Math.floor(Math.random() * loaders.length)
</script>

<div class="m-auto">
	<svelte:component this={loaders[type]} />
</div>
