<script lang="ts">
	export let url: string = '/images/logo-full.png'

	export let width = 200
	export let height = 150
</script>

<div
	class="m-auto max-w-full"
	style="background-image: url({url}); width: {width}px; height: {height}px;"
/>

<style>
	div {
		background-position: center center;
		background-size: contain;
		background-repeat: no-repeat;
	}
</style>
