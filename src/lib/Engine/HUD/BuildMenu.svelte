<script lang="ts">
	import { onDestroy, onMount } from 'svelte'
	import { addToast } from 'as-toast'
	import { gameState } from '../gameState'
	import { spriteStore } from '$lib/Sprites/spriteStore'
	import { buildableUnits, spawnBuiltUnit, type BuildableUnit } from '../build'
	import { beginBuildPlacement } from '../Interactor/interactor'
	import { walletOf } from '../wallet'
	import { buildMenuState, closeBuildMenu } from './buildMenuStore'
	import { audioEngine } from '$lib/Audio/audioEngine'
	import { sfxForAction } from '$lib/Audio/sfxMap'
	import UnitSpritePreview from './UnitSpritePreview.svelte'

	// The unit currently hovered in the grid — its preview cycles through the four
	// facing directions while pointed at, idle (front-facing still) otherwise.
	let hoveredType: number | null = null

	export let map: MapObject | undefined = undefined

	$: menu = $buildMenuState
	$: state = $gameState
	$: currentPlayer = state.players.find((p) => p.team === state.currentTeam)
	// In builder mode the funds come from the Warmachine's own wallet, and it can
	// build any unit type regardless of which factories the player owns.
	$: builderUnit =
		menu.open && menu.mode === 'builder' && map && menu.buildingTile != null
			? (map.layers.units[menu.buildingTile] ?? null)
			: null
	$: isBuilder = menu.mode === 'builder'
	$: budget = isBuilder ? (builderUnit ? walletOf(builderUnit) : 0) : (currentPlayer?.money ?? 0)
	$: entries =
		menu.open && currentPlayer
			? buildableUnits(currentPlayer, isBuilder ? { budget, ignoreControls: true } : {})
			: []

	const typeOrder = ['ground', 'air', 'sea'] as const
	const typeLabel: Record<(typeof typeOrder)[number], string> = {
		ground: 'Ground',
		air: 'Air',
		sea: 'Sea'
	}
	$: columns = typeOrder
		.map((type) => ({
			type,
			label: typeLabel[type],
			units: entries.filter((entry) => entry.data.type === type)
		}))
		.filter((column) => column.units.length > 0)

	const handleSelect = (entry: BuildableUnit) => {
		if (!entry.buildable) return
		if (!map) return
		if (menu.buildingTile == null || menu.team == null) return

		// Builder (Warmachine): don't deploy immediately. Close the menu and hand off
		// to the board's directional picker, which highlights every adjacent tile the
		// chosen unit can legally stand on and lets the player pick a cardinal
		// direction. The build chime fires there once a tile is confirmed.
		if (menu.mode === 'builder') {
			closeBuildMenu()
			if (!beginBuildPlacement(map, menu.buildingTile, menu.team, entry.type)) {
				addToast('No space to deploy unit', 'warn')
			}
			return
		}

		const result = spawnBuiltUnit(map, menu.buildingTile, entry.type, menu.team)
		if (result.ok) {
			// Live human spawn — the build menu mutates directly (not via applyAction),
			// so fire the build chime here. Replay never touches this path.
			const sfx = sfxForAction('build')
			if (sfx) audioEngine.playSfx(sfx)
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
		<div class="bg-neutral-900 text-white rounded p-4 max-w-3xl w-auto shadow-2xl">
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
				{isBuilder ? 'Holdings' : 'Money'}: ${budget}
			</div>

			{#if entries.length === 0}
				<div class="text-sm font-mono opacity-75 py-4 text-center">
					No buildable units available.
				</div>
			{:else}
				<div class="flex gap-3 max-h-96 overflow-y-auto">
					{#each columns as column (column.type)}
						<div class="flex flex-col gap-2 w-[16rem] shrink-0">
							<div
								class="text-xs font-mono uppercase tracking-wide opacity-60 px-1 sticky top-0 bg-neutral-900 py-1"
							>
								{column.label}
							</div>
							{#each column.units as entry (entry.type)}
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
									on:mouseenter={() => (hoveredType = entry.type)}
									on:mouseleave={() => {
										if (hoveredType === entry.type) hoveredType = null
									}}
									on:focus={() => (hoveredType = entry.type)}
									on:blur={() => {
										if (hoveredType === entry.type) hoveredType = null
									}}
								>
									<div
										class="w-10 h-10 overflow-hidden bg-black/40 flex items-center justify-center shrink-0"
									>
										<UnitSpritePreview
											image={$spriteStore['units']?.[entry.type]?.[menu.team ?? 0]}
											type={entry.type}
											size={40}
											rotate={hoveredType === entry.type}
										/>
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
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}
