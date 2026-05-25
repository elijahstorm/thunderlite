<script lang="ts">
	import { onDestroy, onMount } from 'svelte'
	import { addToast } from 'as-toast'
	import { gameState } from '../gameState'
	import { spriteStore } from '$lib/Sprites/spriteStore'
	import { unitData } from '$lib/GameData/unit'
	import { buildableUnits, spawnBuiltUnit, type BuildableUnit } from '../build'
	import { buildMenuState, closeBuildMenu } from './buildMenuStore'

	export let map: MapObject | undefined = undefined

	$: menu = $buildMenuState
	$: state = $gameState
	$: currentPlayer = state.players.find((p) => p.team === state.currentTeam)
	$: entries =
		menu.open && currentPlayer
			? buildableUnits(currentPlayer)
			: []

	const handleSelect = (entry: BuildableUnit) => {
		if (!entry.buildable) return
		if (!map) return
		if (menu.buildingTile == null || menu.team == null) return
		const result = spawnBuiltUnit(map, menu.buildingTile, entry.type, menu.team)
		if (result.ok) {
			closeBuildMenu()
			return
		}
		if (result.reason === 'no-space') {
			addToast('No space to deploy unit', 'warn')
		}
	}

	const handleCancel = () => closeBuildMenu()

	const onKey = (evt: KeyboardEvent) => {
		if (!menu.open) return
		if (evt.key === 'Escape') {
			evt.preventDefault()
			handleCancel()
		}
	}

	onMount(() => {
		if (typeof window !== 'undefined') window.addEventListener('keydown', onKey)
	})
	onDestroy(() => {
		if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey)
	})
</script>

{#if menu.open}
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
		data-testid="build-menu"
		role="dialog"
		aria-modal="true"
	>
		<div class="bg-neutral-900 text-white rounded p-4 max-w-md w-[28rem] shadow-2xl">
			<div class="flex items-center justify-between mb-3">
				<h2 class="text-base font-mono">Build Unit</h2>
				<button
					type="button"
					class="px-2 py-1 rounded bg-neutral-700 text-sm font-mono hover:bg-neutral-600"
					data-testid="build-menu-cancel"
					on:click={handleCancel}
				>
					Cancel
				</button>
			</div>

			<div class="text-xs font-mono mb-2 opacity-75">
				Money: ${currentPlayer?.money ?? 0}
			</div>

			{#if entries.length === 0}
				<div class="text-sm font-mono opacity-75 py-4 text-center">
					No buildable units available.
				</div>
			{:else}
				<div class="grid grid-cols-2 gap-2 max-h-[24rem] overflow-y-auto">
					{#each entries as entry (entry.type)}
						<button
							type="button"
							class="flex items-center gap-2 px-2 py-2 rounded bg-neutral-800 text-left font-mono text-sm border border-neutral-700 hover:border-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-neutral-700"
							data-testid={`build-option-${entry.type}`}
							disabled={!entry.buildable}
							title={!entry.controlled
								? `Requires ${entry.data.type} control`
								: !entry.affordable
									? `Need $${entry.data.cost}`
									: entry.data.name}
							on:click={() => handleSelect(entry)}
						>
							<div
								class="w-10 h-10 overflow-hidden bg-black/40 flex items-center justify-center shrink-0"
							>
								{#if $spriteStore['units']?.[entry.type]?.[menu.team ?? 0]}
									<img
										class="object-cover min-w-fit"
										src={$spriteStore['units'][entry.type][menu.team ?? 0].src}
										alt={unitData[entry.type].name}
										style="margin-top: {-unitData[entry.type].yOffset + 6}px"
									/>
								{/if}
							</div>
							<div class="flex flex-col">
								<span>{entry.data.name}</span>
								<span class="text-xs opacity-75">
									${entry.data.cost}{#if !entry.controlled}
										<span class="ml-1 uppercase">· locked</span>
									{/if}
								</span>
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}
