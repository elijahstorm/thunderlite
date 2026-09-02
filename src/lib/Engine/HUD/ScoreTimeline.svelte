<script lang="ts">
	import { untrack } from 'svelte'
	import Icon from '@iconify/svelte'
	import { teamColor } from '../teamColors'
	import {
		TIMELINE_METRICS,
		decisivePoint,
		leadChanges,
		leadShare,
		leaderAt,
		metricValue,
		type TimelineMetric,
		type TimelinePoint,
	} from '../matchTimeline'

	/**
	 * ScoreTimeline — the shape of the match, one line per side, on the results
	 * screen. Reads the handover samples `matchTimeline` recorded and plots the
	 * chosen metric over the rounds axis. Hovering finds the nearest sample and
	 * reads every side out; clicking (a line, or a legend chip) fills the area
	 * under one side so its rise and fall stands apart from the rest.
	 */

	interface Props {
		points: TimelinePoint[]
		/** Teams to plot, in table order. */
		teams: number[]
		labelFor: (team: number) => string
		localTeam?: number
		winner?: number | null
	}

	let { points, teams, labelFor, localTeam = 0, winner = null }: Props = $props()

	// Layout. The SVG is sized in CSS pixels (no viewBox scaling) so stroke widths
	// and text stay crisp at any width and pointer maths is a straight subtraction.
	const HEIGHT = 220
	const PAD = { top: 14, right: 16, bottom: 26, left: 46 }
	let width = $state(0)
	let plotW = $derived(Math.max(0, width - PAD.left - PAD.right))
	let plotH = HEIGHT - PAD.top - PAD.bottom

	let metric = $state<TimelineMetric>('strength')
	// The side whose area is filled in. Starts on the local player so the chart
	// reads as "your game" at a glance; clicking the same side again clears it.
	let selected = $state<number | null>(
		untrack(() => (teams.includes(localTeam) ? localTeam : null))
	)
	let hoverIdx = $state<number | null>(null)

	const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
	const full = new Intl.NumberFormat('en-US')

	let series = $derived(
		teams.map((team) => ({
			team,
			values: points.map((p) => metricValue(p.teams[team], metric)),
		}))
	)

	let x0 = $derived(points[0]?.x ?? 1)
	let x1 = $derived.by(() => {
		const last = points[points.length - 1]?.x ?? x0
		return last > x0 ? last : x0 + 1
	})

	// A "nice" ceiling (1 / 2 / 5 × 10^k) a little above the tallest value, so the
	// top gridline is a round number and the lines never kiss the frame.
	let yMax = $derived.by(() => {
		let max = 0
		for (const s of series) for (const v of s.values) if (v > max) max = v
		if (max <= 0) return 1
		const raw = max * 1.08
		const mag = Math.pow(10, Math.floor(Math.log10(raw)))
		for (const step of [1, 2, 2.5, 5, 10]) {
			if (step * mag >= raw) return step * mag
		}
		return 10 * mag
	})

	const sx = (x: number): number => PAD.left + ((x - x0) / (x1 - x0)) * plotW
	const sy = (v: number): number => PAD.top + (1 - v / yMax) * plotH

	const linePath = (values: number[]): string =>
		values.map((v, i) => `${i === 0 ? 'M' : 'L'}${sx(points[i].x)} ${sy(v)}`).join(' ')

	const areaPath = (values: number[]): string => {
		if (values.length === 0) return ''
		const base = sy(0)
		return `${linePath(values)} L${sx(points[values.length - 1].x)} ${base} L${sx(points[0].x)} ${base} Z`
	}

	// Integer round ticks, thinned so the axis never crowds past ~8 labels.
	let xTicks = $derived.by(() => {
		const first = Math.ceil(x0)
		const last = Math.floor(x1)
		const span = Math.max(1, last - first)
		const step = [1, 2, 5, 10, 20, 50].find((s) => span / s <= 8) ?? 100
		const ticks: number[] = []
		for (let t = first; t <= last; t += step) ticks.push(t)
		return ticks
	})
	const yTicks = [0.25, 0.5, 0.75, 1]

	let hovered = $derived(hoverIdx === null ? null : (points[hoverIdx] ?? null))

	/** The sample nearest a pointer x, in CSS pixels from the SVG's left edge. */
	const nearestIndex = (px: number): number => {
		let best = 0
		let bestDist = Infinity
		for (let i = 0; i < points.length; i++) {
			const d = Math.abs(sx(points[i].x) - px)
			if (d < bestDist) {
				bestDist = d
				best = i
			}
		}
		return best
	}

	const onPointerMove = (event: PointerEvent) => {
		const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
		hoverIdx = nearestIndex(event.clientX - rect.left)
	}
	const onPointerLeave = () => {
		hoverIdx = null
	}

	// A click picks the side whose line is nearest the pointer at that sample and
	// toggles its fill, so the area can be chosen straight off the chart.
	const onClick = (event: MouseEvent) => {
		const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
		const idx = nearestIndex(event.clientX - rect.left)
		const py = event.clientY - rect.top
		let pick: number | null = null
		let bestDist = Infinity
		for (const s of series) {
			const d = Math.abs(sy(s.values[idx]) - py)
			if (d < bestDist) {
				bestDist = d
				pick = s.team
			}
		}
		toggle(pick)
	}
	const toggle = (team: number | null) => {
		selected = selected === team ? null : team
	}

	const pointTitle = (p: TimelinePoint): string => {
		if (p.afterTeam === null) return 'Start'
		if (p.final) return `Final, turn ${p.turn}`
		return `Turn ${p.turn}`
	}
	const pointSubtitle = (p: TimelinePoint): string | null =>
		p.afterTeam === null ? null : `after ${labelFor(p.afterTeam)}`

	/** Tooltip rows, biggest first, so the leader is on top. */
	let hoverRows = $derived.by(() => {
		if (!hovered) return []
		const p = hovered
		return teams
			.map((team) => ({ team, value: metricValue(p.teams[team], metric) }))
			.sort((a, b) => b.value - a.value)
	})
	let hoverLead = $derived.by(() => {
		if (!hovered || hoverRows.length < 2) return null
		const leader = leaderAt(hovered, metric)
		if (leader === null) return 'Tied'
		const margin = hoverRows[0].value - hoverRows[1].value
		return `${labelFor(leader)} leads by ${full.format(margin)}`
	})
	// Flip the tooltip to the pointer's left past the midline so it never clips.
	let tooltipLeftSide = $derived(hovered !== null && sx(hovered.x) > width / 2)

	// The story, read off the same points: how contested it was, when it was
	// settled, and who spent the match on top.
	let changes = $derived(leadChanges(points, metric))
	let decisive = $derived(decisivePoint(points, metric, winner))
	let share = $derived(leadShare(points, metric))
	let shareRows = $derived(
		teams
			.map((team) => ({ team, share: share[team] ?? 0 }))
			.filter((row) => row.share > 0)
			.sort((a, b) => b.share - a.share)
	)
	let decidedLabel = $derived.by(() => {
		if (winner === null) return 'Never'
		if (decisive) return decisive.final ? 'Final turn' : `Turn ${decisive.turn}`
		const ledThroughout = points.length > 0 && leaderAt(points[0], metric) === winner
		return ledThroughout ? 'From the start' : 'On the board'
	})
	let decidedHint = $derived.by(() => {
		if (winner === null) return 'Ended in a draw'
		if (decisive) return `${labelFor(winner)} took the lead for good`
		const ledThroughout = points.length > 0 && leaderAt(points[0], metric) === winner
		return ledThroughout ? `${labelFor(winner)} led the whole way` : 'Won without the lead'
	})

	let metricLabel = $derived(TIMELINE_METRICS.find((m) => m.key === metric)?.label ?? '')
	let ariaLabel = $derived(
		`${metricLabel} by turn for ${teams.map((t) => labelFor(t)).join(', ')}, over ${points.length} samples`
	)
</script>

<div class="flex flex-col gap-3" data-testid="score-timeline">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<!-- Legend doubles as the selector: one chip per side, current value inline. -->
		<div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Highlight a side">
			{#each series as s (s.team)}
				<button
					type="button"
					class="flex items-center gap-2 rounded-md border px-2 py-1 text-xs transition-colors {selected ===
					s.team
						? 'border-border-strong bg-surface-2 text-foreground'
						: 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'}"
					aria-pressed={selected === s.team}
					onclick={() => toggle(s.team)}
					data-testid="score-timeline-legend"
					data-team={s.team}
				>
					<span
						class="h-0.5 w-3.5 shrink-0 rounded-full"
						style="background:{teamColor(s.team)}"
						aria-hidden="true"
					></span>
					<span class="font-medium">{labelFor(s.team)}</span>
					<span class="tabular-nums">{compact.format(s.values[s.values.length - 1] ?? 0)}</span>
				</button>
			{/each}
		</div>

		<div
			class="flex items-center gap-0.5 rounded-md bg-muted p-0.5"
			role="group"
			aria-label="Metric"
		>
			{#each TIMELINE_METRICS as m (m.key)}
				<button
					type="button"
					class="rounded px-2 py-0.5 text-[11px] font-medium transition-colors {metric === m.key
						? 'bg-card text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
					aria-pressed={metric === m.key}
					onclick={() => (metric = m.key)}
					data-testid="score-timeline-metric"
					data-metric={m.key}
				>
					{m.label}
				</button>
			{/each}
		</div>
	</div>

	<div class="relative" bind:clientWidth={width}>
		{#if width > 0}
			<!-- Keyboard users pick a side with the legend buttons above; the SVG click is a
		     pointer shortcut to the same toggle. -->
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<svg
				{width}
				height={HEIGHT}
				class="block cursor-crosshair select-none overflow-visible"
				role="img"
				aria-label={ariaLabel}
				onpointermove={onPointerMove}
				onpointerleave={onPointerLeave}
				onclick={onClick}
			>
				<!-- Recessive grid and axes. -->
				{#each yTicks as t (t)}
					<line
						x1={PAD.left}
						x2={PAD.left + plotW}
						y1={sy(yMax * t)}
						y2={sy(yMax * t)}
						class="stroke-border"
						stroke-width="1"
					/>
					<text
						x={PAD.left - 8}
						y={sy(yMax * t)}
						text-anchor="end"
						dominant-baseline="middle"
						class="fill-muted-foreground text-[10px] tabular-nums"
					>
						{compact.format(yMax * t)}
					</text>
				{/each}
				<line
					x1={PAD.left}
					x2={PAD.left + plotW}
					y1={sy(0)}
					y2={sy(0)}
					class="stroke-border-strong"
					stroke-width="1"
				/>
				{#each xTicks as t (t)}
					<text
						x={sx(t)}
						y={HEIGHT - 8}
						text-anchor="middle"
						class="fill-muted-foreground text-[10px] tabular-nums"
					>
						{t}
					</text>
				{/each}
				<text
					x={PAD.left + plotW}
					y={HEIGHT - 8}
					text-anchor="end"
					class="fill-muted-foreground/70 text-[10px] uppercase tracking-wide"
				>
					turn
				</text>

				<!-- Where the match was settled. -->
				{#if decisive && !decisive.final}
					<line
						x1={sx(decisive.x)}
						x2={sx(decisive.x)}
						y1={PAD.top}
						y2={sy(0)}
						class="stroke-muted-foreground/50"
						stroke-width="1"
						stroke-dasharray="3 3"
					/>
				{/if}

				<!-- The filled side, under everything else. -->
				{#each series as s (s.team)}
					{#if selected === s.team}
						<path
							d={areaPath(s.values)}
							fill={teamColor(s.team)}
							fill-opacity="0.18"
							data-testid="score-timeline-area"
							data-team={s.team}
						/>
					{/if}
				{/each}

				<!-- Lines, non-selected sides receding when one is picked. -->
				{#each series as s (s.team)}
					<path
						d={linePath(s.values)}
						fill="none"
						stroke={teamColor(s.team)}
						stroke-width="2"
						stroke-linejoin="round"
						stroke-linecap="round"
						class="transition-opacity"
						opacity={selected === null || selected === s.team ? 1 : 0.35}
						data-testid="score-timeline-line"
						data-team={s.team}
					/>
				{/each}

				<!-- End-of-match dots, one per side. -->
				{#each series as s (s.team)}
					{#if s.values.length > 0}
						<circle
							cx={sx(points[points.length - 1].x)}
							cy={sy(s.values[s.values.length - 1])}
							r="3.5"
							fill={teamColor(s.team)}
							class="stroke-card"
							stroke-width="2"
							opacity={selected === null || selected === s.team ? 1 : 0.35}
						/>
					{/if}
				{/each}

				<!-- Crosshair + markers at the hovered sample. -->
				{#if hovered}
					<line
						x1={sx(hovered.x)}
						x2={sx(hovered.x)}
						y1={PAD.top}
						y2={sy(0)}
						class="stroke-foreground/40"
						stroke-width="1"
					/>
					{#each series as s (s.team)}
						<circle
							cx={sx(hovered.x)}
							cy={sy(s.values[hoverIdx ?? 0])}
							r="4.5"
							fill={teamColor(s.team)}
							class="stroke-card"
							stroke-width="2"
						/>
					{/each}
				{/if}
			</svg>

			{#if hovered}
				<div
					class="pointer-events-none absolute top-2 z-10 min-w-[10rem] rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg"
					style={tooltipLeftSide
						? `right:${width - sx(hovered.x) + 12}px`
						: `left:${sx(hovered.x) + 12}px`}
					data-testid="score-timeline-tooltip"
				>
					<div class="flex items-baseline justify-between gap-3">
						<span class="font-semibold text-foreground">{pointTitle(hovered)}</span>
						{#if pointSubtitle(hovered)}
							<span class="text-[11px] text-muted-foreground">{pointSubtitle(hovered)}</span>
						{/if}
					</div>
					<ul class="mt-1.5 flex flex-col gap-1">
						{#each hoverRows as row (row.team)}
							<li class="flex items-center gap-2">
								<span
									class="h-0.5 w-3 shrink-0 rounded-full"
									style="background:{teamColor(row.team)}"
									aria-hidden="true"
								></span>
								<span class="tabular-nums font-semibold text-foreground"
									>{full.format(row.value)}</span
								>
								<span class="truncate text-muted-foreground">{labelFor(row.team)}</span>
							</li>
						{/each}
					</ul>
					{#if hoverLead}
						<div class="mt-1.5 border-t border-border pt-1.5 text-[11px] text-muted-foreground">
							{hoverLead}
						</div>
					{/if}
				</div>
			{/if}
		{/if}
	</div>

	<!-- The story in three glances. -->
	<div class="grid gap-2 sm:grid-cols-3" data-testid="score-timeline-insights">
		<div class="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
			<p class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
				<Icon icon="lucide:repeat" width={12} />
				Lead changes
			</p>
			<p class="mt-1 text-lg font-semibold tabular-nums" data-testid="score-timeline-lead-changes">
				{changes}
			</p>
		</div>
		<div class="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
			<p class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
				<Icon icon="lucide:flag" width={12} />
				Decided
			</p>
			<p class="mt-1 text-lg font-semibold" data-testid="score-timeline-decided">{decidedLabel}</p>
			<p class="truncate text-[11px] text-muted-foreground">{decidedHint}</p>
		</div>
		<div class="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
			<p class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
				<Icon icon="lucide:crown" width={12} />
				Time in front
			</p>
			{#if shareRows.length === 0}
				<p class="mt-1 text-lg font-semibold">Even</p>
			{:else}
				<div
					class="mt-2.5 flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
					aria-hidden="true"
				>
					{#each shareRows as row (row.team)}
						<span
							class="h-full rounded-full"
							style="width:{row.share * 100}%;background:{teamColor(row.team)}"
						></span>
					{/each}
				</div>
				<p class="mt-1.5 truncate text-[11px] text-muted-foreground tabular-nums">
					{#each shareRows as row, i (row.team)}
						{#if i > 0}<span aria-hidden="true"> &middot; </span>{/if}
						{labelFor(row.team)}
						{Math.round(row.share * 100)}%
					{/each}
				</p>
			{/if}
		</div>
	</div>
</div>
