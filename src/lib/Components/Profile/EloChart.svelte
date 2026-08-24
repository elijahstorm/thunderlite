<script lang="ts">
	import type { EloHistory, EloPoint } from '$lib/Database/getEloHistory'

	/**
	 * A player's ladder curve over their rated matches.
	 *
	 * Drawn as plain inline SVG sized from the measured container width rather
	 * than a stretched viewBox, so strokes and text keep their true size at every
	 * breakpoint. Colours come from the theme tokens, so it reads correctly in
	 * light and dark without a second palette.
	 *
	 * The x-axis is match order, not calendar time: ratings move per game, and
	 * spacing a two-year gap proportionally would squash the interesting part of
	 * the curve into a corner. Dates still show in each point's tooltip.
	 */

	interface Props {
		history: EloHistory
		height?: number
		/** Copy for the empty state, which is the common case for new accounts. */
		emptyLabel?: string
	}

	let { history, height = 160, emptyLabel = 'No rated games yet.' }: Props = $props()

	let points = $derived(history?.points ?? [])
	let width = $state(0)

	// Room for the min/max labels on the right and the dot radius everywhere else.
	const PAD = { top: 12, right: 44, bottom: 14, left: 8 }

	let plotWidth = $derived(Math.max(0, width - PAD.left - PAD.right))
	let plotHeight = $derived(Math.max(0, height - PAD.top - PAD.bottom))

	let values = $derived(points.map((p) => p.elo))
	let low = $derived(values.length ? Math.min(...values) : 0)
	let high = $derived(values.length ? Math.max(...values) : 0)
	// A flat curve (one game, or a run of identical ratings) would divide by zero;
	// pad it into a band so the line sits mid-chart instead of on an edge.
	let span = $derived(high - low || 40)
	let floor = $derived(high === low ? low - span / 2 : low)

	const xOf = (index: number): number =>
		PAD.left + (points.length < 2 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth)
	const yOf = (elo: number): number => PAD.top + (1 - (elo - floor) / span) * plotHeight

	let line = $derived(
		points
			.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p.elo).toFixed(1)}`)
			.join(' ')
	)
	// The line closed down to the baseline, for the soft fill under it.
	let area = $derived(
		points.length && plotWidth > 0
			? `${line} L${xOf(points.length - 1).toFixed(1)},${(PAD.top + plotHeight).toFixed(1)} L${xOf(0).toFixed(1)},${(PAD.top + plotHeight).toFixed(1)} Z`
			: ''
	)

	// Where the player started, so the whole curve reads as "up from here" or
	// "down from here" without doing the arithmetic.
	let startElo = $derived(points.length ? points[0].elo : null)
	let net = $derived(points.length > 1 ? points[points.length - 1].elo - points[0].elo : 0)

	const dotFill = (point: EloPoint): string =>
		point.outcome === 'win'
			? 'var(--success)'
			: point.outcome === 'loss'
				? 'var(--destructive)'
				: 'var(--muted-foreground)'

	const tooltip = (point: EloPoint): string => {
		const when = point.at
			? new Date(point.at).toLocaleDateString(undefined, {
					month: 'short',
					day: 'numeric',
					year: 'numeric',
				})
			: null
		if (point.matchId == null) return `Starting rating ${point.elo}${when ? ` · ${when}` : ''}`
		const move =
			point.delta == null ? '' : point.delta > 0 ? ` (+${point.delta})` : ` (${point.delta})`
		const result = point.outcome ? point.outcome[0].toUpperCase() + point.outcome.slice(1) : 'Match'
		return `${result} · ${point.elo}${move}${when ? ` · ${when}` : ''}`
	}
</script>

<div class="w-full" bind:clientWidth={width} data-testid="elo-chart">
	{#if points.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
	{:else if width > 0}
		<svg
			{width}
			{height}
			viewBox="0 0 {width} {height}"
			role="img"
			aria-label="Rating over the last {history.rated} rated {history.rated === 1
				? 'match'
				: 'matches'}: {points[0].elo} to {points[points.length - 1].elo}"
		>
			<defs>
				<linearGradient id="elo-fade" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stop-color="var(--primary)" stop-opacity="0.22" />
					<stop offset="100%" stop-color="var(--primary)" stop-opacity="0" />
				</linearGradient>
			</defs>

			<!-- Starting rating: the reference the rest of the curve is read against. -->
			{#if startElo != null}
				<line
					x1={PAD.left}
					x2={PAD.left + plotWidth}
					y1={yOf(startElo)}
					y2={yOf(startElo)}
					stroke="var(--border-strong)"
					stroke-width="1"
					stroke-dasharray="3 4"
				/>
			{/if}

			<path d={area} fill="url(#elo-fade)" />
			<path
				d={line}
				fill="none"
				stroke="var(--primary)"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>

			<!-- One dot per rated match (plus the starting point), coloured by result.
			     Suppressed on long curves, where they'd merge into a smear. -->
			{#if points.length <= 40}
				{#each points as point, i (i)}
					<circle
						cx={xOf(i)}
						cy={yOf(point.elo)}
						r={i === points.length - 1 ? 4 : 2.5}
						fill={point.matchId == null ? 'var(--surface)' : dotFill(point)}
						stroke={point.matchId == null ? 'var(--border-strong)' : 'var(--card)'}
						stroke-width="1.5"
					>
						<title>{tooltip(point)}</title>
					</circle>
				{/each}
			{/if}

			<!-- High / low labels instead of a full axis: two numbers carry the scale. -->
			<text
				x={width - PAD.right + 8}
				y={yOf(high) + 4}
				fill="var(--muted-foreground)"
				font-size="11"
				class="tabular-nums">{high}</text
			>
			{#if high !== low}
				<text
					x={width - PAD.right + 8}
					y={yOf(low) + 4}
					fill="var(--muted-foreground)"
					font-size="11"
					class="tabular-nums">{low}</text
				>
			{/if}
		</svg>

		<p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
			<span>
				Last {history.rated} rated {history.rated === 1 ? 'match' : 'matches'}
			</span>
			{#if points.length > 1}
				<span aria-hidden="true">&middot;</span>
				<span
					class="font-semibold tabular-nums {net > 0
						? 'text-emerald-600 dark:text-emerald-400'
						: net < 0
							? 'text-red-600 dark:text-red-400'
							: ''}"
				>
					{net > 0 ? `+${net}` : net} overall
				</span>
			{/if}
			{#if history.peak != null}
				<span aria-hidden="true">&middot;</span>
				<span>Peak {history.peak}</span>
			{/if}
		</p>
	{/if}
</div>
