<script lang="ts">
	import Icon from '@iconify/svelte'

	/**
	 * The one way a ladder rating is drawn anywhere in the app — the header, a
	 * lobby seat, the in-game player list, a match-history row, a profile popup.
	 * One component so a rating always reads the same and is recognisable at a
	 * glance without a label next to it.
	 *
	 * `null` means unrated (no rated game yet), which is a real state and not an
	 * error: it renders as a muted "Unrated" rather than as a seeded 1200, since
	 * a displayed rating should be a fact about games actually played.
	 */

	interface Props {
		/** The rating, or null/undefined when the player has no rated game yet. */
		elo?: number | null
		/** Signed movement to show alongside the number (e.g. a just-finished match). */
		delta?: number | null
		size?: 'xs' | 'sm' | 'md'
		/** Draw the pill background/border. Off for dense rows that supply their own. */
		bare?: boolean
		/** Hide the "Unrated" pill entirely instead of drawing it. */
		hideUnrated?: boolean
		/** Dark-surface variant for the in-game HUD, which sits over the board. */
		onDark?: boolean
	}

	let {
		elo = null,
		delta = null,
		size = 'sm',
		bare = false,
		hideUnrated = false,
		onDark = false,
	}: Props = $props()

	let rated = $derived(elo != null && Number.isFinite(Number(elo)))
	let value = $derived(rated ? Math.round(Number(elo)) : null)

	const text = { xs: 'text-[10px]', sm: 'text-xs', md: 'text-sm' }
	const pad = { xs: 'px-1.5 py-0', sm: 'px-2 py-0.5', md: 'px-2.5 py-0.5' }
	const icon = { xs: 10, sm: 11, md: 13 }

	let shell = $derived(
		bare
			? ''
			: onDark
				? `rounded-full bg-white/10 ${pad[size]}`
				: `rounded-full border border-border bg-surface-2 ${pad[size]}`
	)
	let tone = $derived(
		rated
			? onDark
				? 'text-white/90'
				: 'text-foreground'
			: onDark
				? 'text-white/45'
				: 'text-muted-foreground'
	)
	let deltaTone = $derived(
		delta == null || delta === 0
			? onDark
				? 'text-white/50'
				: 'text-muted-foreground'
			: delta > 0
				? 'text-emerald-600 dark:text-emerald-400'
				: 'text-red-600 dark:text-red-400'
	)
</script>

{#if rated || !hideUnrated}
	<span
		class="inline-flex items-center gap-1 font-semibold tabular-nums whitespace-nowrap {text[
			size
		]} {shell} {tone}"
		title={rated ? `Ladder rating: ${value}` : 'No rated games yet'}
		data-testid="rating-badge"
		data-elo={value ?? ''}
	>
		<Icon icon="lucide:trending-up" width={icon[size]} class="shrink-0 opacity-60" />
		{#if rated}
			{value}
		{:else}
			<span class="font-medium">Unrated</span>
		{/if}
		{#if delta != null}
			<span class={deltaTone} data-testid="rating-badge-delta">
				{delta > 0 ? `+${delta}` : delta}
			</span>
		{/if}
	</span>
{/if}
