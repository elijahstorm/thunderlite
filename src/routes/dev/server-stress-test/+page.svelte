<script lang="ts">
	import { onDestroy } from 'svelte'

	/**
	 * Controls and gauges for the server stress test. The run itself is server
	 * side (see `simulator.server.ts`); this page starts it, stops it, and reads
	 * its snapshot every couple of seconds.
	 *
	 * Two kinds of number sit side by side on purpose. The ledger is what THIS
	 * process spent at the gateway, by namespace and route. The budget column is
	 * what the GATEWAY said back on its last counted response: `remaining` and any
	 * cooldown. When those two disagree, something other than this run is also
	 * spending the project's budget, which at 200 matches is exactly the kind of
	 * thing that has to be known.
	 */

	type RouteStats = {
		route: string
		count: number
		ok: number
		s403: number
		s429: number
		s5xx: number
		other: number
		p50: number
		p95: number
		max: number
	}
	type ScopeRow = {
		scope: string
		perMinute: number
		budget: number | null
		share: number | null
		remaining: number | null
		cooldownSeconds: number
	}
	type Snapshot = {
		state: 'idle' | 'running' | 'stopping' | 'done'
		runId: string | null
		startedAt: number | null
		elapsedMs: number
		options: Options
		rooms: { planned: number; starting: number; live: number; finished: number; failed: number }
		effectiveConcurrency: number
		requests: { total: number; perMinute: number; byRoute: RouteStats[] }
		refusals: { notYourTurn: number; rateLimited: number; other: number }
		ledger: { seconds: number; callsPerMinute: number; scopes: ScopeRow[] }
		errors: { at: number; room: string; route: string; status: number; message: string }[]
		sessions: string[]
	}
	type Options = {
		matches: number
		speed: number
		staggerMs: number
		mapId: string
		pollIntervalMs: number
		stallCheckMs: number
		settle: boolean
		loop: boolean
		relayPerTurn: boolean
	}

	let options: Options = $state({
		matches: 4,
		speed: 1,
		staggerMs: 2000,
		mapId: '',
		pollIntervalMs: 30_000,
		stallCheckMs: 0,
		settle: true,
		loop: true,
		relayPerTurn: true,
	})

	let snapshot: Snapshot | null = $state(null)
	let busy = $state(false)
	let fault = $state('')
	let cleanup: Record<string, number> | null = $state(null)

	const refresh = async () => {
		try {
			const res = await fetch('/api/dev/stress')
			if (!res.ok) {
				fault = `${res.status} ${res.statusText}`
				return
			}
			snapshot = (await res.json()) as Snapshot
			fault = ''
		} catch (err) {
			fault = err instanceof Error ? err.message : 'failed'
		}
	}

	const post = async (body: Record<string, unknown>) => {
		busy = true
		fault = ''
		try {
			const res = await fetch('/api/dev/stress', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
			})
			const data = await res.json().catch(() => null)
			if (!res.ok) {
				fault = (data as { message?: string })?.message ?? `${res.status} ${res.statusText}`
				return null
			}
			return data
		} catch (err) {
			fault = err instanceof Error ? err.message : 'failed'
			return null
		} finally {
			busy = false
		}
	}

	const start = async () => {
		cleanup = null
		const data = await post({ action: 'start', options })
		if (data) snapshot = data as Snapshot
	}
	const stop = async () => {
		const data = await post({ action: 'stop' })
		if (data) snapshot = data as Snapshot
	}
	const wipe = async () => {
		const data = (await post({ action: 'cleanup' })) as { deleted: Record<string, number> } | null
		if (data) cleanup = data.deleted
		await refresh()
	}

	let timer: ReturnType<typeof setInterval> | null = null
	$effect(() => {
		void refresh()
		timer = setInterval(() => void refresh(), 2000)
		return () => {
			if (timer) clearInterval(timer)
		}
	})
	onDestroy(() => {
		if (timer) clearInterval(timer)
	})

	// `$derived.by`, not `$derived`: the expression form is type-checked where
	// `snapshot` is still narrowed to its `null` initializer (see /dev/lag).
	const running = $derived.by(() => snapshot?.state === 'running' || snapshot?.state === 'stopping')

	const pct = (share: number | null) => (share === null ? '—' : `${Math.round(share * 100)}%`)
	const shareColor = (share: number | null): string => {
		if (share === null) return 'text-slate-400'
		if (share >= 0.9) return 'text-red-300'
		if (share >= 0.6) return 'text-amber-300'
		return 'text-emerald-300'
	}
	const elapsed = (ms: number) => {
		const s = Math.floor(ms / 1000)
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
	}
	const shortRoute = (route: string) =>
		route
			.replace('/api/game/[session]/', '')
			.replace('/api/game/[session]', 'room')
			.replace('/api/game/join', 'join')
			.replace('/api/game', 'create')
			.replace('/(app)/play', 'play')

	/**
	 * How many matches like this the budgets would take, from the current rate.
	 * The tightest namespace decides. Reads as "the ceiling this shape implies",
	 * which is the number the whole exercise is about.
	 */
	const ceiling = $derived.by(() => {
		if (!snapshot || snapshot.rooms.live === 0) return null
		const live = snapshot.rooms.live * snapshot.options.speed
		let worst: { scope: string; matches: number } | null = null
		for (const row of snapshot.ledger.scopes) {
			if (!row.budget || row.perMinute <= 0) continue
			const perMatch = row.perMinute / live
			const matches = Math.floor(row.budget / perMatch)
			if (!worst || matches < worst.matches) worst = { scope: row.scope, matches }
		}
		return worst
	})
</script>

<svelte:head>
	<title>Server Stress Test</title>
</svelte:head>

<div class="min-h-screen bg-slate-900 p-6 text-slate-100">
	<div class="mx-auto max-w-6xl space-y-4">
		<header class="flex items-baseline justify-between">
			<div>
				<h1 class="text-xl font-semibold">Server Stress Test</h1>
				<p class="text-xs text-slate-500">
					N simulated online matches against the configured gateway, paced like match 24.
				</p>
			</div>
			<a href="/dev" class="text-xs text-sky-400 hover:underline">← dev</a>
		</header>

		{#if fault}
			<p class="rounded bg-red-500/10 px-2 py-1 text-xs text-red-300">{fault}</p>
		{/if}

		<div class="grid gap-4 md:grid-cols-[minmax(0,20rem)_1fr]">
			<!-- ── Controls ─────────────────────────────────────────────────── -->
			<section class="space-y-3 rounded-lg border border-slate-700 bg-slate-800/60 p-4">
				<h2 class="font-semibold">Run</h2>
				<div class="grid grid-cols-2 gap-2 text-xs">
					<label class="space-y-1">
						<span class="text-slate-500">matches</span>
						<input
							type="number"
							min="1"
							max="400"
							bind:value={options.matches}
							disabled={running}
							class="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 tabular-nums"
						/>
					</label>
					<label class="space-y-1">
						<span class="text-slate-500">speed ×</span>
						<input
							type="number"
							min="0.25"
							max="16"
							step="0.25"
							bind:value={options.speed}
							disabled={running}
							class="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 tabular-nums"
						/>
					</label>
					<label class="space-y-1">
						<span class="text-slate-500">stagger ms</span>
						<input
							type="number"
							min="0"
							step="500"
							bind:value={options.staggerMs}
							disabled={running}
							class="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 tabular-nums"
						/>
					</label>
					<label class="space-y-1">
						<span class="text-slate-500">poll ms</span>
						<input
							type="number"
							min="500"
							step="500"
							bind:value={options.pollIntervalMs}
							disabled={running}
							class="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 tabular-nums"
						/>
					</label>
					<label class="space-y-1">
						<span class="text-slate-500" title="0 = off; virtual players hold no socket"
							>stall check ms</span
						>
						<input
							type="number"
							min="0"
							step="10000"
							bind:value={options.stallCheckMs}
							disabled={running}
							class="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 tabular-nums"
						/>
					</label>
					<label class="col-span-2 space-y-1">
						<span class="text-slate-500">map id</span>
						<input
							bind:value={options.mapId}
							disabled={running}
							placeholder="any playable map id"
							class="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono placeholder:text-slate-600"
						/>
					</label>
					<label class="flex items-center gap-2">
						<input type="checkbox" bind:checked={options.settle} disabled={running} />
						<span class="text-slate-400">settle results</span>
					</label>
					<label class="flex items-center gap-2">
						<input type="checkbox" bind:checked={options.loop} disabled={running} />
						<span class="text-slate-400">loop rooms</span>
					</label>
					<label
						class="col-span-2 flex items-center gap-2"
						title="Off replays each action burst as it happened, the pre-change shape"
					>
						<input type="checkbox" bind:checked={options.relayPerTurn} disabled={running} />
						<span class="text-slate-400">relay whole turns</span>
					</label>
				</div>

				<div class="flex gap-2">
					{#if running}
						<button
							onclick={stop}
							disabled={busy}
							class="flex-1 rounded bg-amber-600 px-3 py-1.5 text-xs font-semibold hover:bg-amber-500 disabled:opacity-50"
						>
							Stop
						</button>
					{:else}
						<button
							onclick={start}
							disabled={busy || !options.mapId.trim()}
							class="flex-1 rounded bg-sky-600 px-3 py-1.5 text-xs font-semibold hover:bg-sky-500 disabled:opacity-50"
						>
							Start
						</button>
					{/if}
					<button
						onclick={wipe}
						disabled={busy || running || !snapshot?.sessions.length}
						title="Delete every row the last run created"
						class="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-40"
					>
						Clean up
					</button>
				</div>

				{#if cleanup}
					<ul class="space-y-0.5 text-xs text-slate-400">
						{#each Object.entries(cleanup) as [table, n] (table)}
							<li class="flex justify-between">
								<span class="font-mono">{table}</span><span>{n}</span>
							</li>
						{/each}
					</ul>
				{/if}

				<p class="text-[11px] leading-relaxed text-slate-500">
					Speed compresses a 22 minute match; the budget is per minute, so 4 matches at 2× load the
					gateway like 8. Loop keeps the room count steady so the reading is a rate, not a burst.
				</p>
			</section>

			<!-- ── Gauges ───────────────────────────────────────────────────── -->
			<section class="space-y-4 rounded-lg border border-slate-700 bg-slate-800/60 p-4">
				{#if snapshot}
					<div class="grid grid-cols-5 gap-2 text-center">
						<div class="rounded bg-slate-900/70 p-2">
							<div
								class="text-lg font-semibold {snapshot.state === 'running'
									? 'text-emerald-300'
									: 'text-slate-300'}"
							>
								{snapshot.state}
							</div>
							<div class="text-[10px] uppercase tracking-wide text-slate-500">state</div>
						</div>
						<div class="rounded bg-slate-900/70 p-2">
							<div class="text-lg font-semibold tabular-nums">{snapshot.rooms.live}</div>
							<div class="text-[10px] uppercase tracking-wide text-slate-500">
								live / {snapshot.rooms.planned}
							</div>
						</div>
						<div class="rounded bg-slate-900/70 p-2">
							<div class="text-lg font-semibold tabular-nums">{elapsed(snapshot.elapsedMs)}</div>
							<div class="text-[10px] uppercase tracking-wide text-slate-500">elapsed</div>
						</div>
						<div class="rounded bg-slate-900/70 p-2">
							<div class="text-lg font-semibold tabular-nums">{snapshot.requests.perMinute}</div>
							<div class="text-[10px] uppercase tracking-wide text-slate-500">req/min</div>
						</div>
						<div
							class="rounded bg-slate-900/70 p-2"
							title="Matches like these the tightest budget would take"
						>
							<div
								class="text-lg font-semibold tabular-nums {ceiling && ceiling.matches < 200
									? 'text-amber-300'
									: 'text-emerald-300'}"
							>
								{ceiling ? ceiling.matches : '—'}
							</div>
							<div class="text-[10px] uppercase tracking-wide text-slate-500">
								ceiling{ceiling ? ` · ${ceiling.scope}` : ''}
							</div>
						</div>
					</div>

					<table class="w-full text-xs">
						<thead class="text-left text-slate-500">
							<tr>
								<th class="py-1">namespace</th>
								<th class="py-1 text-right">/min</th>
								<th class="py-1 text-right">budget</th>
								<th class="py-1 text-right">share</th>
								<th class="py-1 text-right" title="What the gateway last reported">remaining</th>
								<th class="py-1 text-right">cooldown</th>
							</tr>
						</thead>
						<tbody class="tabular-nums">
							{#each snapshot.ledger.scopes as row (row.scope)}
								<tr class="border-t border-slate-700/60">
									<td class="py-1 font-mono">{row.scope}</td>
									<td class="py-1 text-right">{row.perMinute}</td>
									<td class="py-1 text-right text-slate-500">{row.budget ?? '—'}</td>
									<td class="py-1 text-right font-semibold {shareColor(row.share)}"
										>{pct(row.share)}</td
									>
									<td class="py-1 text-right text-slate-400">{row.remaining ?? '—'}</td>
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

					<table class="w-full text-xs">
						<thead class="text-left text-slate-500">
							<tr>
								<th class="py-1">route</th>
								<th class="py-1 text-right">req</th>
								<th class="py-1 text-right">429</th>
								<th class="py-1 text-right">403</th>
								<th class="py-1 text-right">5xx</th>
								<th class="py-1 text-right">p50</th>
								<th class="py-1 text-right">p95</th>
								<th class="py-1 text-right">max</th>
							</tr>
						</thead>
						<tbody class="tabular-nums">
							{#each snapshot.requests.byRoute as row (row.route)}
								<tr class="border-t border-slate-700/60">
									<td class="py-1 font-mono text-slate-300">{shortRoute(row.route)}</td>
									<td class="py-1 text-right">{row.count}</td>
									<td class="py-1 text-right {row.s429 ? 'text-red-300' : 'text-slate-600'}"
										>{row.s429}</td
									>
									<td class="py-1 text-right {row.s403 ? 'text-amber-300' : 'text-slate-600'}"
										>{row.s403}</td
									>
									<td class="py-1 text-right {row.s5xx ? 'text-red-300' : 'text-slate-600'}"
										>{row.s5xx}</td
									>
									<td class="py-1 text-right">{row.p50}</td>
									<td class="py-1 text-right">{row.p95}</td>
									<td class="py-1 text-right text-slate-400">{row.max}</td>
								</tr>
							{/each}
						</tbody>
					</table>

					<div class="grid grid-cols-3 gap-2 text-center text-xs">
						<div class="rounded bg-slate-900/70 p-2">
							<div
								class="font-semibold tabular-nums {snapshot.refusals.rateLimited
									? 'text-red-300'
									: ''}"
							>
								{snapshot.refusals.rateLimited}
							</div>
							<div class="text-[10px] uppercase tracking-wide text-slate-500">rate limited</div>
						</div>
						<div class="rounded bg-slate-900/70 p-2">
							<div
								class="font-semibold tabular-nums {snapshot.refusals.notYourTurn
									? 'text-amber-300'
									: ''}"
							>
								{snapshot.refusals.notYourTurn}
							</div>
							<div class="text-[10px] uppercase tracking-wide text-slate-500">turn refused</div>
						</div>
						<div class="rounded bg-slate-900/70 p-2">
							<div class="font-semibold tabular-nums {snapshot.rooms.failed ? 'text-red-300' : ''}">
								{snapshot.rooms.failed}
							</div>
							<div class="text-[10px] uppercase tracking-wide text-slate-500">rooms failed</div>
						</div>
					</div>

					{#if snapshot.errors.length}
						<div>
							<h3 class="mb-1 text-xs uppercase tracking-wide text-slate-500">Recent errors</h3>
							<ul class="max-h-40 space-y-0.5 overflow-y-auto text-[11px]">
								{#each snapshot.errors as e, i (i)}
									<li class="flex gap-2 font-mono text-slate-400">
										<span class="text-slate-600">{new Date(e.at).toLocaleTimeString()}</span>
										<span class="text-slate-500">{e.room.slice(0, 6)}</span>
										<span>{shortRoute(e.route)}</span>
										<span class={e.status === 429 ? 'text-red-300' : 'text-amber-300'}
											>{e.status}</span
										>
										<span class="truncate text-slate-300">{e.message}</span>
									</li>
								{/each}
							</ul>
						</div>
					{/if}

					{#if snapshot.sessions.length}
						<details class="text-xs">
							<summary class="cursor-pointer text-slate-500">
								{snapshot.sessions.length} sessions
							</summary>
							<ul class="mt-1 grid grid-cols-4 gap-x-3 font-mono text-[11px] text-slate-400">
								{#each snapshot.sessions as s (s)}
									<li><a href={`/dev/lag?session=${s}`} class="hover:text-sky-300">{s}</a></li>
								{/each}
							</ul>
						</details>
					{/if}
				{:else if !fault}
					<p class="text-xs text-slate-500">Loading…</p>
				{/if}
			</section>
		</div>
	</div>
</div>
