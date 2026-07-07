<script lang="ts">
	interface Props {
		icon?: string
		url?: string
		width?: number
		height?: number
	}

	let {
		icon = '/images/logo/colored-small-tank.png',
		url = '/images/logo/colored-small.png',
		width = 200,
		height = 150,
	}: Props = $props()
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
