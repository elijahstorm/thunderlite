<script lang="ts">
	import { modifierDisplay, categoryStyles, type ModifierKey } from '$lib/GameData/modifierInfo'

	// Condensed-but-expandable modifier list. Renders each modifier as a small,
	// color-coded chip you can read at a glance; clicking one reveals how it
	// works. Each instance tracks its own expanded chip.
	export let modifiers: readonly ModifierKey[] = []
	export let testid: string | undefined = undefined

	let expanded: ModifierKey | null = null

	$: displays = modifiers.map(modifierDisplay)
	$: active = expanded != null ? modifierDisplay(expanded) : null

	const toggle = (key: ModifierKey) => {
		expanded = expanded === key ? null : key
	}
</script>

{#if displays.length > 0}
	<div class="mt-1.5" data-testid="modifier-badges">
		<div class="flex flex-wrap gap-1">
			{#each displays as d (d.key)}
				<button
					type="button"
					class="px-1.5 py-px rounded text-[10px] leading-tight inline-flex items-center gap-1 transition-colors {categoryStyles[
						d.category
					].badge} {expanded === d.key ? 'ring-1 ring-white/60' : ''}"
					data-testid={testid}
					aria-expanded={expanded === d.key}
					title={d.label}
					on:click={() => toggle(d.key)}
				>
					<span aria-hidden="true" class="opacity-70">{d.glyph}</span>
					<span>{d.label}</span>
				</button>
			{/each}
		</div>

		{#if active}
			<div
				class="mt-1.5 rounded bg-white/5 border border-white/10 p-1.5 text-[10px] leading-snug"
				data-testid="modifier-detail"
			>
				<div class="flex items-center justify-between gap-2 mb-0.5">
					<span class="font-bold {categoryStyles[active.category].accent}">{active.label}</span>
					<span class="opacity-50 shrink-0">{categoryStyles[active.category].label}</span>
				</div>
				<div class="opacity-60 italic mb-0.5">{active.timing}</div>
				<div class="opacity-90">{active.description}</div>
			</div>
		{/if}
	</div>
{/if}
