<script lang="ts">
	import { deepClone, reform } from './Editor/mapResizer'
	import { Modal } from 'flowbite-svelte'
	import Icon from '@iconify/svelte'

	export let map: MapObject
	export let open = false
	export let apply: (appliedChanges: MapObject) => void

	let updatedMap = deepClone(map)

	let selectedDir: Direction = 'center'
	const directions = [
		'topLeft',
		'top',
		'topRight',
		'left',
		'center',
		'right',
		'bottomLeft',
		'bottom',
		'bottomRight',
	] as const
	const dirIcon: Record<(typeof directions)[number], string> = {
		topLeft: 'mdi:arrow-top-left',
		top: 'mdi:arrow-up',
		topRight: 'mdi:arrow-top-right',
		left: 'mdi:arrow-left',
		center: 'mdi:circle-medium',
		right: 'mdi:arrow-right',
		bottomLeft: 'mdi:arrow-bottom-left',
		bottom: 'mdi:arrow-down',
		bottomRight: 'mdi:arrow-bottom-right',
	}

	const resizer = reform(deepClone(map), (applied: MapObject) => (updatedMap = applied))

	$: resizer(updatedMap, selectedDir)
</script>

<Modal title="Map options" bind:open outsideclose size="lg">
	<section class="flex flex-col gap-6">
		<div>
			<p class="section-eyebrow mb-3">Dimensions</p>
			<div class="mx-auto grid w-full max-w-sm grid-cols-2 gap-4">
				<label class="block">
					<span class="field-label">Columns</span>
					<input
						class="input"
						bind:value={updatedMap.cols}
						type="number"
						min="6"
						max="100"
						placeholder={`${map.cols}`}
					/>
					<span class="mt-1 block text-xs text-muted-foreground">Currently {map.cols}</span>
				</label>
				<label class="block">
					<span class="field-label">Rows</span>
					<input
						class="input"
						bind:value={updatedMap.rows}
						type="number"
						min="6"
						max="100"
						placeholder={`${map.rows}`}
					/>
					<span class="mt-1 block text-xs text-muted-foreground">Currently {map.rows}</span>
				</label>
			</div>
		</div>

		<div class="flex flex-col items-center justify-center gap-8 sm:flex-row sm:items-start">
			<div class="flex flex-col items-center gap-2">
				<p class="section-eyebrow">Anchor</p>
				<div class="grid grid-cols-3 grid-rows-3 gap-1.5">
					{#each directions as dir (dir)}
						<button
							type="button"
							on:click={() => (selectedDir = dir)}
							aria-label={`Anchor ${dir}`}
							aria-pressed={selectedDir === dir}
							class="flex h-10 w-10 items-center justify-center rounded-md border text-muted-foreground transition-all"
							class:border-primary={selectedDir === dir}
							class:bg-accent={selectedDir === dir}
							class:text-primary={selectedDir === dir}
							class:shadow-sm={selectedDir === dir}
							class:border-border={selectedDir !== dir}
							class:hover:bg-muted={selectedDir !== dir}
						>
							<Icon icon={dirIcon[dir]} width="18" height="18" />
						</button>
					{/each}
				</div>
				<p class="max-w-40 text-center text-xs text-muted-foreground">
					Choose which edge stays fixed while resizing
				</p>
			</div>

			<div class="flex flex-col items-center gap-2">
				<p class="section-eyebrow">Preview</p>
				<div
					class="h-44 w-44 overflow-hidden rounded-xl border border-border bg-surface-2 shadow-inner"
				>
					{#if open}
						<slot {updatedMap}></slot>
					{/if}
				</div>
			</div>
		</div>
	</section>

	{#snippet footer()}
		<button type="button" on:click={() => (open = false)} class="btn btn-ghost ml-auto">
			Cancel
		</button>
		<button
			type="button"
			on:click={() => {
				apply(deepClone(updatedMap))
				open = false
			}}
			class="btn btn-primary"
		>
			<Icon icon="mdi:check" width="16" height="16" />
			Apply changes
		</button>
	{/snippet}
</Modal>
