<script lang="ts">
	export let icon: string = '/images/logo/colored-small-tank.png'
	export let url: string = '/images/logo/colored-small.png'

	export let width = 200
	export let height = 150
</script>

<div class="logo">
	{#if icon}
		<div
			class="logo-icon"
			style="background-image: url({icon}); width: {height}px; height: {height}px;"
		></div>
	{/if}
	{#if url}
		<div
			class="logo-mark"
			style="background-image: url({url}); width: {width}px; height: {height}px;"
		></div>
	{/if}
</div>

<style>
	.logo {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}
	.logo-icon,
	.logo-mark {
		background-position: center center;
		background-size: contain;
		background-repeat: no-repeat;
	}
</style>
