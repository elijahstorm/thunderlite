<script lang="ts">
	import { onDestroy, onMount } from 'svelte'
	import { actionMenuState } from './actionMenuStore'
	import { performMenuAction, cancelMenuAsWait } from '../Interactor/interactor'
	import type { ActionMenuItemId } from '../actions'

	export let map: MapObject | undefined = undefined

	$: menu = $actionMenuState

	const labels: Record<ActionMenuItemId, string> = {
		attack: 'Attack',
		capture: 'Capture',
		mine: 'Mine',
		build: 'Build',
		repair: 'Repair',
		wait: 'Wait',
	}

	const handleSelect = (id: ActionMenuItemId) => {
		if (!map) return
		performMenuAction(map, id)
	}

	const handleCancel = () => {
		if (!map) return
		cancelMenuAsWait(map)
	}

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
		class="fixed inset-0 z-[55] flex items-center justify-center bg-black/40"
		data-testid="action-menu"
		role="dialog"
		aria-modal="true"
	>
		<div class="bg-neutral-900 text-white rounded p-3 min-w-[14rem] shadow-2xl">
			<div class="flex items-center justify-between mb-2">
				<h2 class="text-sm font-mono">Actions</h2>
				<button
					type="button"
					class="px-2 py-1 rounded bg-neutral-700 text-xs font-mono hover:bg-neutral-600"
					data-testid="action-menu-cancel"
					on:click={handleCancel}
				>
					Cancel
				</button>
			</div>

			<div class="flex flex-col gap-1">
				{#each menu.items as item (item.id)}
					<button
						type="button"
						class="px-3 py-2 rounded bg-neutral-800 text-left font-mono text-sm border border-neutral-700 hover:border-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-neutral-700"
						data-testid={`action-menu-${item.id}`}
						disabled={!item.enabled}
						title={item.reason ?? labels[item.id]}
						on:click={() => handleSelect(item.id)}
					>
						{labels[item.id]}
						{#if !item.enabled && item.reason}
							<span class="ml-1 text-xs opacity-75">· {item.reason}</span>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}
