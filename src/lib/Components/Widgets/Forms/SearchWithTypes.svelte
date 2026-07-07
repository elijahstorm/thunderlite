<script lang="ts">
	import { untrack } from 'svelte'
	import { fly } from 'svelte/transition'
	import Icon from '@iconify/svelte'

	interface Props {
		types: string[]
		onload?: (detail: { search: string; type: string }) => void
	}

	let { types, onload }: Props = $props()

	let query = $state('')
	let type = $state('')

	let showTypes = $state(false)
	let searchInput = $state<HTMLInputElement>()

	const search = () => {
		onload?.({ search: query, type })
	}

	const changeType = (newType: string) => () => {
		type = newType
		showTypes = false
	}

	const changeSearch = (newSearch: string) => () => (query = newSearch)

	// Fire a search whenever the query text or the selected type changes. Only those
	// two are real dependencies; `search()` calls back into the parent loader which
	// reads+writes its own state (results, hasMore), so it must run untracked — else
	// this effect would depend on that downstream state and loop on every fetch.
	$effect(() => {
		void query
		void type
		untrack(() => search())
	})
</script>

<form
	onsubmit={(e) => {
		e.preventDefault()
		changeSearch(searchInput?.value ?? '')()
	}}
>
	<div class="flex items-stretch gap-2">
		<div class="relative">
			<button
				class="btn btn-outline h-full px-3 gap-2"
				type="button"
				onclick={() => (showTypes = !showTypes)}
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
						onclick={changeType('')}
					>
						All maps
					</button>
					{#each types as selectableType (selectableType)}
						<button
							type="button"
							class="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors"
							class:bg-accent={type === selectableType}
							onclick={changeType(selectableType)}
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
