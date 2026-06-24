<script lang="ts">
	import { deepClone, reform } from './Editor/mapResizer'
	import { Modal } from 'flowbite-svelte'
	import Icon from '@iconify/svelte'

	export let map: MapObject
	export let open = false
	export let apply: (appliedChanges: MapObject) => void

	let updatedMap = deepClone(map)

	// Fog defaults to on; mirror through a boolean the checkbox can bind to.
	let fog = updatedMap.fog ?? true
	$: updatedMap.fog = fog

	// The dimension inputs bind to plain numbers, NOT directly to `updatedMap`.
	// Mid-edit the field can momentarily be empty (null) or 0, and binding that
	// straight onto the shared map object would collapse the resized layers and
	// break the preview. Keeping them separate lets the resizer ignore invalid
	// values while `updatedMap` stays a consistent, fully-resized map at all times.
	let cols = updatedMap.cols
	let rows = updatedMap.rows

	let selectedDir: Direction = 'center'

	// `map` is mutated in place by the editor as the user paints, but the clones
	// below are captured once at mount. Re-clone from the live map every time the
	// modal opens so the preview and applied changes reflect the current map.
	let wasOpen = false
	$: if (open && !wasOpen) {
		wasOpen = true
		updatedMap = deepClone(map)
		fog = updatedMap.fog ?? true
		cols = updatedMap.cols
		rows = updatedMap.rows
		selectedDir = 'center'
		resizer = reform(deepClone(map), (applied: MapObject) => (updatedMap = applied))
	} else if (!open) {
		wasOpen = false
	}
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

	let resizer = reform(deepClone(map), (applied: MapObject) => (updatedMap = applied))

	// Resize only for valid positive dimensions; while the field is empty/0 the
	// resizer is skipped and `updatedMap` retains the last good resized map, so the
	// preview holds steady instead of collapsing until a valid number is entered.
	$: if (cols > 0 && rows > 0) resizer({ ...updatedMap, cols, rows }, selectedDir)
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
						bind:value={cols}
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
						bind:value={rows}
						type="number"
						min="6"
						max="100"
						placeholder={`${map.rows}`}
					/>
					<span class="mt-1 block text-xs text-muted-foreground">Currently {map.rows}</span>
				</label>
			</div>
		</div>

		<div>
			<p class="section-eyebrow mb-3">Rules</p>
			<div class="mx-auto grid w-full max-w-sm gap-4 sm:grid-cols-2">
				<label class="flex items-center justify-between gap-3 rounded-md border border-border p-3">
					<span class="field-label mb-0">Fog of war</span>
					<input type="checkbox" class="h-5 w-5 accent-primary" bind:checked={fog} />
				</label>
				<label class="block">
					<span class="field-label">Starting funds</span>
					<input class="input" bind:value={updatedMap.funds} type="number" min="0" step="100" />
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
