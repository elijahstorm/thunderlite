<script lang="ts">
	import { createEventDispatcher } from 'svelte'
	import { fly } from 'svelte/transition'
	import Icon from '@iconify/svelte'

	export let types: string[]

	const dispatch = createEventDispatcher()
	let query = ''
	let type = ''

	let showTypes = false
	let searchInput: HTMLInputElement

	const search = () => {
		dispatch('load', { search: query, type })
	}

	const changeType = (newType: string) => () => {
		type = newType
		showTypes = false
	}

	const changeSearch = (newSearch: string) => () => (query = newSearch)

	$: {
		type
		query
		search()
	}
</script>

<form on:submit|preventDefault={changeSearch(searchInput.value)}>
	<div class="flex items-stretch gap-2">
		<div class="relative">
			<button
				class="btn btn-outline h-full px-3 gap-2"
				type="button"
				on:click={() => (showTypes = !showTypes)}
				aria-haspopup="listbox"
				aria-expanded={showTypes}
			>
				<Icon icon="lucide:filter" width={14} />
				<span class="text-sm">{type ? type : 'All maps'}</span>
				<Icon icon="lucide:chevron-down" width={14} />
			</button>
			{#if showTypes}
				<div
					class="absolute top-full left-0 mt-1.5 z-20 card overflow-hidden w-48 p-1"
					in:fly={{ y: -8, duration: 160 }}
					out:fly={{ y: -8, duration: 160 }}
				>
					<button
						type="button"
						class="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors"
						class:bg-accent={type === ''}
						on:click={changeType('')}
					>
						All maps
					</button>
					{#each types as selectableType (selectableType)}
						<button
							type="button"
							class="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors"
							class:bg-accent={type === selectableType}
							on:click={changeType(selectableType)}
						>
							{selectableType}
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<div class="relative flex-1">
			<div
				class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
			>
				<Icon icon="lucide:search" width={16} />
			</div>
			<label for="maps-search" class="sr-only">Search for maps</label>
			<input
				bind:this={searchInput}
				id="maps-search"
				type="search"
				class="input pl-10"
				placeholder="Search maps by name, author, or description"
			/>
		</div>
	</div>
</form>
