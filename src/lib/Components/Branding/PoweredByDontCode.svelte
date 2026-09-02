<script lang="ts">
	import Icon from '@iconify/svelte'

	interface Props {
		// footer  → full sponsor credit line for page footers
		// badge   → compact pill for fullscreen / chrome-less screens
		// inline  → single muted line for side panels and dense layouts
		variant?: 'footer' | 'badge' | 'inline'
		class?: string
	}

	let { variant = 'inline', class: className = '' }: Props = $props()

	const HREF = 'https://www.dontcode.co'
</script>

{#if variant === 'footer'}
	<div class="flex items-center gap-2 text-xs text-muted-foreground {className}">
		<Icon icon="lucide:heart-handshake" width={14} class="text-primary" />
		<span>
			Made with and sponsored in full by
			<a href={HREF} target="_blank" rel="noopener noreferrer" class="link">DontCode</a>.
		</span>
	</div>
{:else if variant === 'badge'}
	<a
		href={HREF}
		target="_blank"
		rel="noopener noreferrer"
		class="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/90 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground hover:border-border-strong {className}"
		aria-label="Made with DontCode"
	>
		<Icon icon="lucide:heart-handshake" width={12} class="text-primary" />
		Made with DontCode
	</a>
{:else}
	<p class="text-xs text-muted-foreground {className}">
		Made with
		<a href={HREF} target="_blank" rel="noopener noreferrer" class="link">DontCode</a>
	</p>
{/if}
