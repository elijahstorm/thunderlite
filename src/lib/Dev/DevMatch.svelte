<script lang="ts">
	import GameSocket from '$lib/Components/Socket/GameSocket.svelte'
	import GameStateManager from '$lib/Engine/GameStateManager.svelte'
	import GameBoard from '$lib/Map/GameBoard.svelte'
	import { socketEndTurn, socketSelect } from '$lib/Components/Socket/socket'
	import { clearAnimations } from '$lib/Engine/Animator/animator'
	import type { CpuPolicy } from '$lib/Engine/cpuAi'
	import type { SearchConfig, SearchTelemetry } from '$lib/Engine/cpuAi/search'

	// A real, fully client-side match — the exact stack /dev/los uses. An
	// 'ephemeral' session makes GameSocket fall back to its LocalInteracter so the
	// board plays entirely in-browser. Every other team is CPU-controlled; set

	interface Props {
		// `localTeam` to a value no player holds (e.g. -1) to spectate a CPU-vs-CPU run.
		map: MapObject
		localTeam?: number
		fogOfWar?: boolean
		menuHref?: string
		/** Bumped by the parent to force a fresh board (scene / weather change). */
		rebuildKey?: string | number
		/** Fix the match seed (reproduce a run). Null rolls a fresh one. */
		seed?: number | null
		/** Per-seat CPU policy (the playtest's Greedy / Search seats). */
		cpuPolicyFor?: ((team: number) => CpuPolicy) | undefined
		cpuSearch?: Partial<SearchConfig> | undefined
		cpuFast?: boolean
		onCpuSearch?: ((team: number, telemetry: SearchTelemetry) => void) | undefined
	}

	let {
		map,
		localTeam = 0,
		fogOfWar = false,
		menuHref = '/dev',
		rebuildKey = 0,
		seed = null,
		cpuPolicyFor = undefined,
		cpuSearch = undefined,
		cpuFast = false,
		onCpuSearch = undefined,
	}: Props = $props()

	const gameSession = 'ephemeral'

	// The animation overlays live in module-global stores driven by timers, so a
	// unit walking on the outgoing board would otherwise keep firing — and flash a
	// ghost overlay across the new map — after the keyed block below rebuilds. Tear
	// those animations down whenever the board identity changes (scene / team / fog).
	$effect(() => {
		// Bare reads so the effect re-runs whenever the board identity changes;
		// clearAnimations() itself only touches the module-global animation stores.
		void rebuildKey
		void localTeam
		void fogOfWar
		clearAnimations()
	})
</script>

{#key `${rebuildKey}|${localTeam}|${fogOfWar}`}
	<GameSocket map={() => map} {gameSession}>
		{#snippet children({ socket, requestRedraw })}
			<GameStateManager
				{map}
				{gameSession}
				{localTeam}
				{seed}
				mode="hotseat"
				{cpuPolicyFor}
				{cpuSearch}
				{cpuFast}
				{onCpuSearch}
				interactor={socket ? socketSelect(socket, () => map) : undefined}
				endTurnAction={socket ? socketEndTurn(socket, () => map) : undefined}
			>
				{#snippet children({ select })}
					<GameBoard {map} {requestRedraw} {select} {fogOfWar} {localTeam} {menuHref} />
				{/snippet}
			</GameStateManager>
		{/snippet}
	</GameSocket>
{/key}
