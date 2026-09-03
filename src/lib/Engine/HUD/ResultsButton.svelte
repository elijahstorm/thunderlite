<script lang="ts">
	import Icon from '@iconify/svelte'
	import { resultsDismissed, toggleResults } from './resultsPanelStore'

	interface Props {
		/** Collapsed rail: icon-only. */
		compact?: boolean
	}

	let { compact = false }: Props = $props()

	// Once the match is decided the End Turn slot has nothing left to do, so it
	// hands over to this: the way back to the report after putting it away to
	// look at the board, and a way to put it away again. Quiet while the report
	// is up; the one lit control on the rail once it has been dismissed.
	let open = $derived(!$resultsDismissed)
	let label = $derived(open ? 'Hide results' : 'Show results')
</script>

<button
	type="button"
	class="flex w-full items-center justify-center gap-2 rounded-md font-semibold transition-colors {compact
		? 'h-8 px-0 text-xs'
		: 'px-3 py-2 text-sm'} {open
		? 'bg-white/10 text-white hover:bg-white/15'
		: 'bg-amber-400/90 text-amber-950 shadow-sm hover:bg-amber-300'}"
	data-testid="results-toggle"
	title={label}
	aria-label={label}
	aria-pressed={open}
	onclick={toggleResults}
>
	<Icon icon="lucide:trophy" width={compact ? 18 : 16} height={compact ? 18 : 16} />
	{#if compact}
		<span class="sr-only">{label}</span>
	{:else}
		<span class="truncate">Results</span>
	{/if}
</button>
