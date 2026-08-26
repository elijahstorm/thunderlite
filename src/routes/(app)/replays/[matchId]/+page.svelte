<script lang="ts">
	import type { PageData } from './$types'
	import MapLoader from '$lib/Map/MapLoader.svelte'
	import ReplayViewer from '$lib/Components/Replay/ReplayViewer.svelte'

	interface Props {
		data: PageData
	}

	let { data }: Props = $props()
</script>

<svelte:head>
	<title>Replay: {data.mapName || 'match'} | ThunderLite</title>
</svelte:head>

<section class="h-screen overflow-clip">
	<MapLoader mapHash={data.mapHash}>
		{#snippet children({ map })}
			<ReplayViewer
				{map}
				actions={data.actions}
				seats={data.seats}
				mapName={data.mapName}
				winnerTeam={data.winnerTeam}
				seed={data.seed}
				sessionId={data.sessionId}
				menuHref="/my/games"
			/>
		{/snippet}
	</MapLoader>
</section>
