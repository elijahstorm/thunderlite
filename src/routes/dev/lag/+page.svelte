<script lang="ts">
	import { onDestroy } from 'svelte'

	/**
	 * Two views of the same failure, because it has two halves.
	 *
	 * The ledger (left) is the cause: what the app is spending at the gateway and
	 * on which routes. The gateway budgets calls per namespace per minute for the
	 * whole project — the database as two, reads and writes apart — so a room can
	 * stall with every individual call returning promptly. When that happens the
	 * reason is a share of `db/read` gone on the sync path's polling, or of the
	 * tighter `db/write` gone on relays and diagnostics, not a slow database.
	 *
	 * The room trace (right) is the effect: what one match's clients measured.
	 * `owed` is a sender's backlog (actions on its board the room has not
	 * accepted), `logLag` is a receiver's (events in the log it has not applied).
	 * The host on turn 29 while the spectator watches turn 14 is one of each, and
	 * neither client can see the other's, which is why this puts them side by side.
	 */

	type ScopeRow = {
		scope: string
		perMinute: number
		budget: number | null
		share: number | null
		remaining: number | null
		cooldownSeconds: number
	}
	type Ledger = {
		window: {
			seconds: number
			calls: number
			callsPerMinute: number
			failures: number
			meanMs: number
		}
		scopes: ScopeRow[]
		routes: { route: string; calls: number }[]
	}
	type LagPlayer = {
		player: string
		relays: number
		actions: number
		batchedShare: number
		actionsPerRelay: number
		relayP50: number
		relayP95: number
		relayMax: number
		callsPerAction: number | null
		maxOwed: number
		maxLogLag: number
		catchingUpShare: number
		maxQueueLagMs: number
	}
	type RoomTrace = {
		session: string
		lag: {
			players: LagPlayer[]
			worstOwed: number
			worstLogLag: number
			worstCatchingUpShare: number
			spanMs: number
		}
		firstDivergenceEventId: number | null
		eventCount: number
		entries: { by: string; kind: string; eventId: number; ts: number; detail: unknown }[]
	}

	let ledger: Ledger | null = $state(null)
	let ledgerError = $state('')
	let live = $state(true)
	let token = $state('')

	let session = $state('')
	let room: RoomTrace | null = $state(null)
	let roomError = $state('')
	let roomLoading = $state(false)

	const loadLedger = async () => {
		try {
			const query = token ? `?token=${encodeURIComponent(token)}` : ''
			const res = await fetch(`/api/diagnostics/gateway${query}`)
			if (!res.ok) {
				ledgerError = `${res.status} ${res.statusText}`
				return
			}
			ledger = (await res.json()) as Ledger
			ledgerError = ''
		} catch (err) {
			ledgerError = err instanceof Error ? err.message : 'failed'
		}
	}

	const loadRoom = async () => {
		if (!session.trim()) return
		roomLoading = true
		roomError = ''
		try {
			const res = await fetch(`/api/game/${encodeURIComponent(session.trim())}/log?limit=5000`)
			if (!res.ok) {
				roomError = `${res.status} ${res.statusText}`
				room = null
				return
			}
			room = (await res.json()) as RoomTrace
		} catch (err) {
			roomError = err instanceof Error ? err.message : 'failed'
		} finally {
			roomLoading = false
		}
	}

	// The ledger is a rolling 60s window on whichever instance answers, so it only
	// means anything if it's read repeatedly.
	let timer: ReturnType<typeof setInterval> | null = null
	$effect(() => {
		if (timer) clearInterval(timer)
		timer = null
		if (!live) return
		void loadLedger()
		timer = setInterval(() => void loadLedger(), 3000)
	})
	onDestroy(() => {
		if (timer) clearInterval(timer)
	})

	/**
	 * Gauge ticks over time — the shape of a match falling behind and catching up.
	 * `$derived.by` rather than `$derived`: the expression form is checked inline
	 * where `room` is still narrowed to its `null` initializer.
	 */
	const gauges = $derived.by(() =>
		(room?.entries ?? [])
			.filter((e) => e.kind === 'perf' && (e.detail as { what?: string })?.what === 'gauge')
			.map((e) => {
				const detail = e.detail as Record<string, unknown>
				return {
					by: e.by,
					ts: e.ts,
					owed: Number(detail.owed ?? 0),
					logLag: Number(detail.logLag ?? 0),
					queued: Number(detail.queued ?? 0),
				}
			})
	)
	const peakBacklog = $derived(gauges.reduce((worst, g) => Math.max(worst, g.owed, g.logLag), 0))

	const shareColor = (share: number | null): string => {
		if (share === null) return 'text-slate-400'
		if (share >= 0.7) return 'text-red-300'
		if (share >= 0.4) return 'text-amber-300'
		return 'text-emerald-300'
	}
	const backlogColor = (value: number): string => {
		if (value >= 20) return 'text-red-300'
		if (value >= 5) return 'text-amber-300'
		if (value > 0) return 'text-sky-300'
		return 'text-slate-500'
	}
	const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`)
</script>

<svelte:head>
	<title>ThunderLite — Lag</title>
</svelte:head>

<main class="min-h-screen bg-slate-900 p-6 text-slate-100">
	<header class="mx-auto max-w-6xl space-y-1">
		<div class="flex items-baseline justify-between gap-4">
			<h1 class="text-2xl font-bold">Runtime Lag</h1>
			<a href="/dev" class="text-sm text-slate-400 hover:text-slate-200">← Dev</a>
		</div>
		<p class="text-sm text-slate-400">
			Gateway spend on the left (the cause), a room's measured backlog on the right (the effect).
			Call count is what caps a room's throughput, not milliseconds: the platform budgets calls per
			namespace per minute across the whole project.
		</p>
	</header>

	<div class="mx-auto mt-6 grid max-w-6xl gap-6 lg:grid-cols-2">
		<!-- ── Gateway ledger ──────────────────────────────────────────────── -->
		<section class="space-y-3 rounded-lg border border-slate-700 bg-slate-800/60 p-4">
			<div class="flex items-center justify-between gap-3">
				<h2 class="font-semibold">Gateway spend</h2>
				<label class="flex items-center gap-2 text-xs text-slate-400">
					<input type="checkbox" bind:checked={live} class="accent-sky-500" />
					live
				</label>
			</div>
			<input
				bind:value={token}
				placeholder="DIAGNOSTICS_TOKEN (production only)"
				class="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 placeholder:text-slate-600"
			/>

			{#if ledgerError}
				<p class="rounded bg-red-500/10 px-2 py-1 text-xs text-red-300">{ledgerError}</p>
			{/if}

			{#if ledger}
				<div class="grid grid-cols-4 gap-2 text-center">
					{#each [{ label: 'calls/min', value: ledger.window.callsPerMinute }, { label: 'window', value: `${ledger.window.seconds}s` }, { label: 'mean', value: `${ledger.window.meanMs}ms` }, { label: 'failed', value: ledger.window.failures }] as stat}
						<div class="rounded bg-slate-900/70 p-2">
							<div class="text-lg font-semibold tabular-nums">{stat.value}</div>
							<div class="text-[10px] uppercase tracking-wide text-slate-500">{stat.label}</div>
						</div>
					{/each}
				</div>

				<table class="w-full text-xs">
					<thead class="text-left text-slate-500">
						<tr>
							<th class="py-1">namespace</th>
							<th class="py-1 text-right">/min</th>
							<th class="py-1 text-right">budget</th>
							<th class="py-1 text-right">share</th>
							<th class="py-1 text-right">cooldown</th>
						</tr>
					</thead>
					<tbody class="tabular-nums">
						{#each ledger.scopes as row}
							<tr class="border-t border-slate-700/60">
								<td class="py-1 font-mono">{row.scope}</td>
								<td class="py-1 text-right">{row.perMinute}</td>
								<td class="py-1 text-right text-slate-500">{row.budget ?? '—'}</td>
								<td class="py-1 text-right font-semibold {shareColor(row.share)}">
									{pct(row.share)}
								</td>
								<td
									class="py-1 text-right {row.cooldownSeconds > 0
										? 'text-red-300'
										: 'text-slate-600'}"
								>
									{row.cooldownSeconds > 0 ? `${row.cooldownSeconds}s` : '—'}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>

				<div>
					<h3 class="mb-1 text-xs uppercase tracking-wide text-slate-500">Calls by route</h3>
					<ul class="space-y-0.5 text-xs">
						{#each ledger.routes as row}
							<li class="flex items-center justify-between gap-2">
								<span class="truncate font-mono text-slate-300">{row.route}</span>
								<span class="tabular-nums text-slate-400">{row.calls}</span>
							</li>
						{/each}
					</ul>
				</div>
			{:else if !ledgerError}
				<p class="text-xs text-slate-500">Loading…</p>
			{/if}
		</section>

		<!-- ── Room trace ──────────────────────────────────────────────────── -->
		<section class="space-y-3 rounded-lg border border-slate-700 bg-slate-800/60 p-4">
			<h2 class="font-semibold">Room backlog</h2>
			<form
				class="flex gap-2"
				onsubmit={(e) => {
					e.preventDefault()
					void loadRoom()
				}}
			>
				<input
					bind:value={session}
					placeholder="game session id"
					class="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 placeholder:text-slate-600"
				/>
				<button
					type="submit"
					class="rounded bg-sky-600 px-3 py-1 text-xs font-semibold hover:bg-sky-500 disabled:opacity-50"
					disabled={roomLoading}
				>
					{roomLoading ? '…' : 'Load'}
				</button>
			</form>

			{#if roomError}
				<p class="rounded bg-red-500/10 px-2 py-1 text-xs text-red-300">{roomError}</p>
			{/if}

			{#if room}
				<div class="grid grid-cols-4 gap-2 text-center">
					<div class="rounded bg-slate-900/70 p-2">
						<div class="text-lg font-semibold tabular-nums {backlogColor(room.lag.worstOwed)}">
							{room.lag.worstOwed}
						</div>
						<div class="text-[10px] uppercase tracking-wide text-slate-500">worst owed</div>
					</div>
					<div
						class="rounded bg-slate-900/70 p-2"
						title="Share of ticks where a client gave up animating and fast-forwarded. Log lag on its own is normal — a spectator watching a turn play out is behind the log on purpose."
					>
						<div
							class="text-lg font-semibold tabular-nums {room.lag.worstCatchingUpShare >= 0.2
								? 'text-red-300'
								: room.lag.worstCatchingUpShare > 0
									? 'text-amber-300'
									: 'text-slate-500'}"
						>
							{pct(room.lag.worstCatchingUpShare)}
						</div>
						<div class="text-[10px] uppercase tracking-wide text-slate-500">fast-forwarded</div>
					</div>
					<div class="rounded bg-slate-900/70 p-2">
						<div class="text-lg font-semibold tabular-nums">{room.eventCount}</div>
						<div class="text-[10px] uppercase tracking-wide text-slate-500">events</div>
					</div>
					<div class="rounded bg-slate-900/70 p-2">
						<div
							class="text-lg font-semibold tabular-nums {room.firstDivergenceEventId === null
								? 'text-slate-500'
								: 'text-red-300'}"
						>
							{room.firstDivergenceEventId ?? '—'}
						</div>
						<div class="text-[10px] uppercase tracking-wide text-slate-500">divergence</div>
					</div>
				</div>

				{#if room.lag.players.length === 0}
					<p class="text-xs text-slate-500">
						No timing entries. Either the match predates the perf trace, or the recorder was
						silenced by an outright gateway refusal.
					</p>
				{:else}
					<table class="w-full text-xs">
						<thead class="text-left text-slate-500">
							<tr>
								<th class="py-1">client</th>
								<th class="py-1 text-right">actions</th>
								<th class="py-1 text-right">per relay</th>
								<th class="py-1 text-right">calls/action</th>
								<th class="py-1 text-right">p50</th>
								<th class="py-1 text-right">p95</th>
								<th class="py-1 text-right">owed</th>
								<th class="py-1 text-right">lag</th>
								<th class="py-1 text-right">q lag</th>
								<th class="py-1 text-right">ff</th>
							</tr>
						</thead>
						<tbody class="tabular-nums">
							{#each room.lag.players as p}
								<tr class="border-t border-slate-700/60">
									<td class="py-1 font-mono">{p.player}</td>
									<td class="py-1 text-right">{p.actions}</td>
									<td class="py-1 text-right">{p.actionsPerRelay}</td>
									<td class="py-1 text-right {(p.callsPerAction ?? 0) > 6 ? 'text-amber-300' : ''}">
										{p.callsPerAction ?? '—'}
									</td>
									<td class="py-1 text-right">{p.relayP50}ms</td>
									<td class="py-1 text-right {p.relayP95 > 1500 ? 'text-amber-300' : ''}">
										{p.relayP95}ms
									</td>
									<td class="py-1 text-right font-semibold {backlogColor(p.maxOwed)}">
										{p.maxOwed}
									</td>
									<td class="py-1 text-right {backlogColor(p.maxLogLag)}">
										{p.maxLogLag}
									</td>
									<!-- How long an inbound event sat before this client played it. This
									     is what the receiving queue paces choreography on: under the
									     budget it watches the turn, over it fast-forwards. -->
									<td
										class="py-1 text-right {(p.maxQueueLagMs ?? 0) >= 6000
											? 'text-red-300'
											: (p.maxQueueLagMs ?? 0) >= 3000
												? 'text-amber-300'
												: 'text-slate-500'}"
									>
										{Math.round((p.maxQueueLagMs ?? 0) / 100) / 10}s
									</td>
									<td
										class="py-1 text-right font-semibold {p.catchingUpShare >= 0.2
											? 'text-red-300'
											: p.catchingUpShare > 0
												? 'text-amber-300'
												: 'text-slate-600'}"
									>
										{pct(p.catchingUpShare)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}

				{#if gauges.length}
					<div>
						<h3 class="mb-1 text-xs uppercase tracking-wide text-slate-500">
							Backlog over time ({gauges.length} ticks, peak {peakBacklog})
						</h3>
						<!-- One column per tick: owed above the line, log lag below. Reading
						     left to right shows whether a room recovered or kept sliding. -->
						<div class="flex h-24 items-center gap-px overflow-x-auto rounded bg-slate-900/70 p-1">
							{#each gauges as g}
								{@const owed = g.owed}
								{@const lag = g.logLag}
								<div
									class="flex h-full w-1.5 shrink-0 flex-col justify-center"
									title="{g.by}: owed {owed}, logLag {lag}"
								>
									<div class="flex h-1/2 flex-col justify-end">
										<div
											class="w-full rounded-t bg-amber-400/80"
											style="height: {peakBacklog ? (owed / peakBacklog) * 100 : 0}%"
										></div>
									</div>
									<div class="h-px bg-slate-700"></div>
									<div class="h-1/2">
										<div
											class="w-full rounded-b bg-sky-400/80"
											style="height: {peakBacklog ? (lag / peakBacklog) * 100 : 0}%"
										></div>
									</div>
								</div>
							{/each}
						</div>
						<div class="mt-1 flex flex-wrap gap-3 text-[10px] text-slate-500">
							<span><span class="text-amber-400">▲</span> owed (sender behind)</span>
							<span><span class="text-sky-400">▼</span> log lag (watching, or behind)</span>
							<span>
								Log lag alone is healthy: a client animating someone else's turn is behind the log
								on purpose. The <span class="text-slate-300">ff</span> column is the one that means it
								gave up watching.
							</span>
						</div>
					</div>
				{/if}
			{/if}
		</section>
	</div>
</main>
