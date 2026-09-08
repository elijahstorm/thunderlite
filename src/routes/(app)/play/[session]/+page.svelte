<script lang="ts">
	import type { PageData } from './$types'
	import MatchView from '$lib/Components/Play/MatchView.svelte'

	interface Props {
		data: PageData
	}

	let { data }: Props = $props()
</script>

<MatchView
	userSession={data.userSession}
	gameSession={data.gameSession}
	mapHash={data.mapHash}
	localTeam={data.localTeam ?? 0}
	roster={data.roster ?? {}}
	memberKeys={data.memberKeys ?? {}}
	aiTeams={data.aiTeams ?? []}
	isAiDriver={data.isAiDriver ?? false}
	asyncGame={data.asyncGame ?? false}
	turnDeadline={data.turnDeadline ?? null}
	seed={data.seed ?? null}
/>
