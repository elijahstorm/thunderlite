<script lang="ts">
	import { PUBLIC_GAME_NAME } from '$env/static/public'
	import Scroller from '$lib/Scroller/Scroller.svelte'
</script>

<svelte:head>
	<title>{PUBLIC_GAME_NAME}</title>
</svelte:head>

<Scroller />
