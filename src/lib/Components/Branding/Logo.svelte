<script lang="ts">
	export let icon: string = '/images/logo/colored-small-tank.png'
	export let url: string = '/images/logo/colored-small.png'

	export let width = 200
	export let height = 150
</script>

<div class="flex items-center gap-3">
	{#if icon}
		<div
			class="m-auto max-w-full"
			style="background-image: url({icon}); width: {height}px; height: {height}px;"
		/>
	{/if}
	{#if url}
		<div
			class="m-auto max-w-full"
			style="background-image: url({url}); width: {width}px; height: {height}px;"
		/>
	{/if}
</div>

<style>
	div {
		background-position: center center;
		background-size: contain;
		background-repeat: no-repeat;
	}
</style>
