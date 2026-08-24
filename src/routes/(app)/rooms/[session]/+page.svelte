<script lang="ts">
	import type { PageData } from './$types'
	import { onDestroy, onMount, untrack } from 'svelte'
	import { browser } from '$app/environment'
	import { goto, invalidateAll } from '$app/navigation'
	import Icon from '@iconify/svelte'
	import Header from '$lib/Components/Branding/Header.svelte'
	import ContentWithFooter from '$lib/Components/PageContainers/ContentWithFooter.svelte'
	import GameChat from '$lib/Components/Socket/GameChat.svelte'
	import UserIcon from '$lib/Components/Auth/UserIcon.svelte'
	import { cachedImage } from '$lib/Storage/cachedImage'
	import { openDmWith } from '$lib/Stores/openDm'
	import { RealtimeConnection, type RealtimeMessage } from '$lib/dontcode/realtimeClient'
	import { formatTurnTimeout } from '$lib/Game/asyncConfig'

	interface Props {
		data: PageData
	}

	let { data }: Props = $props()

	const isAsync = $derived(data.mode === 'async')
	const turnClockLabel = $derived(
		data.turnTimeoutMs != null ? formatTurnTimeout(data.turnTimeoutMs) : null
	)

	const POLL_INTERVAL = 1500
	const TICK_INTERVAL = 250

	let count = $state(untrack(() => data.count))
	let startAt: number | null = $state(untrack(() => data.startAt))
	// Ready-up state (live rooms only). Seeded from the loader, then kept fresh by
	// the poll / realtime push like `count` and `startAt` are.
	let myReady = $state(untrack(() => data.myReady))
	let readyCount = $state(untrack(() => data.readyCount))
	let humanCount = $state(untrack(() => data.humanCount))
	// Whether the host may launch right now. In a live room that means every human
	// present has readied — the seats nobody took are handed to the CPU on start,
	// so a three-side map does not need three people. Kept fresh by the poll.
	let canHostStart = $state(untrack(() => data.canHostStart))
	const maxPlayers = $derived(data.maxPlayers)
	let isHost = $derived(data.isHost)
	let teams = $derived(data.teams)
	let members = $derived(data.members)
	let memberByTeam = $derived(
		new Map(members.filter((m) => m.team != null).map((m) => [m.team, m]))
	)
	let randomMembers = $derived(members.filter((m) => m.team == null))

	// Side labels/colours by team index (0 = red, 1 = blue, …).
	const SIDE = [
		{ name: 'Red', dot: 'bg-red-500' },
		{ name: 'Blue', dot: 'bg-blue-500' },
		{ name: 'Green', dot: 'bg-green-500' },
		{ name: 'Yellow', dot: 'bg-amber-400' },
	]
	const sideOf = (team: number) => SIDE[team] ?? { name: `Side ${team + 1}`, dot: 'bg-muted' }
	const nameOf = (m: (typeof members)[number]) =>
		m.isAi ? 'CPU' : m.isMe ? 'You' : m.user?.display_name || m.user?.username || 'Player'
	// My own row reads the optimistic local flag so the chip flips on click rather
	// than on the loader round-trip behind it.
	const readyOf = (m: (typeof members)[number]) => (m.isMe ? myReady : m.ready)

	let lobbyBusy = $state(false)
	let lobbyError = $state('')

	const lobbyAction = async (body: Record<string, unknown>): Promise<boolean> => {
		if (lobbyBusy) return false
		lobbyBusy = true
		lobbyError = ''
		try {
			const res = await fetch(`/api/game/${data.session}/lobby`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			})
			if (!res.ok) {
				const err = (await res.json().catch(() => null)) as { message?: string } | null
				throw new Error(err?.message ?? 'Could not update the lobby')
			}
			const body2 = (await res.json().catch(() => null)) as { startAt?: number | null } | null
			// The endpoint re-evaluates the countdown on every action, so take its
			// verdict directly instead of waiting for the next poll to notice.
			if (body2 && 'startAt' in body2) startAt = body2.startAt ?? null
			await invalidateAll()
			return true
		} catch (err) {
			lobbyError = err instanceof Error ? err.message : 'Could not update the lobby'
			return false
		} finally {
			lobbyBusy = false
		}
	}

	const takeSide = (team: number) => lobbyAction({ action: 'pick', team })
	const goRandom = () => lobbyAction({ action: 'pick', team: null })
	const addAi = (team: number | null) => lobbyAction({ action: 'addAi', team })
	const removeMember = (target: string) => lobbyAction({ action: 'remove', target })
	const assign = (target: string, team: number | null) =>
		lobbyAction({ action: 'assign', target, team })
	const toggleLock = () => lobbyAction({ action: 'lock', lock: !data.lockRandom })

	/**
	 * Ready-up: the live lobby's consent gate. Nothing starts until every human
	 * seat has pressed this, and any change to the lineup afterwards (a join, a
	 * side swap, a kick) clears it server-side so the room re-confirms.
	 */
	const toggleReady = async () => {
		const next = !myReady
		myReady = next // optimistic; the poll/loader is authoritative
		const ok = await lobbyAction({ action: 'ready', ready: next })
		if (!ok) myReady = !next
	}

	// Recomputed on a fast ticker so the countdown reads down smoothly.
	let now = $state(Date.now())
	let full = $derived(count >= maxPlayers)
	let emptySeats = $derived(Math.max(0, maxPlayers - count))
	// A live room still needs every human seat readied before anything starts; the
	// difference is that a room which never filled no longer waits forever — the
	// host's own start button (see `canHostStart`) hands the free sides to CPUs.
	let waitingOnReady = $derived(data.requiresReady && readyCount < humanCount)
	let remainingMs = $derived(startAt != null ? Math.max(0, startAt - now) : null)
	let remainingSecs = $derived(remainingMs != null ? Math.ceil(remainingMs / 1000) : null)

	let starting = $state(false)
	let startError = $state('')
	let launched = false

	const launch = () => {
		if (launched) return
		launched = true
		if (browser) goto('/play')
	}

	// The single place the lobby decides it's time to play: `start_at` is set and
	// has arrived. Driven by both the poll (canonical state) and the ticker (so we
	// fire the instant the local countdown hits zero without waiting for a poll).
	$effect(() => {
		if (startAt != null && now >= startAt) launch()
	})

	const applyState = (state: {
		count?: number
		startAt?: number | null
		ready?: boolean
		readyCount?: number
		humanCount?: number
		canHostStart?: boolean
	}) => {
		// A change in occupancy means seats/teams may have changed too — re-run the
		// loader so every client sees the same side assignments without a reload.
		if (typeof state.count === 'number' && state.count !== count) {
			count = state.count
			if (browser) void invalidateAll()
		}
		if (typeof state.ready === 'boolean') myReady = state.ready
		if (typeof state.readyCount === 'number') readyCount = state.readyCount
		if (typeof state.humanCount === 'number') humanCount = state.humanCount
		if (typeof state.canHostStart === 'boolean') canHostStart = state.canHostStart
		if (state.startAt != null) {
			startAt = state.startAt
		} else if ('startAt' in state) {
			// An explicit null is authoritative: the room lost its clearance to
			// start (someone un-readied, a seat changed, or it emptied out), so the
			// countdown stands down and re-arms fresh the next time it qualifies.
			startAt = null
		}
	}

	const poll = async () => {
		try {
			const res = await fetch(`/api/game/${data.session}`)
			if (res.status === 403 || res.status === 404) {
				// Kicked, expired, or the room vanished — back to the rooms hub.
				if (browser) goto('/rooms')
				return
			}
			if (!res.ok) return
			const body = (await res.json()) as {
				count?: number
				startAt?: number | null
				ready?: boolean
				readyCount?: number
				humanCount?: number
				canHostStart?: boolean
			}
			applyState(body)
		} catch {
			// Transient network error — the next tick retries.
		}
	}

	const startNow = async () => {
		if (starting || !canHostStart) return
		starting = true
		startError = ''
		try {
			const res = await fetch(`/api/game/${data.session}/start`, { method: 'POST' })
			const body = await res.json().catch(() => null)
			if (!res.ok) throw new Error(body?.message ?? 'Could not start the match')
			if (body?.startAt) startAt = body.startAt
		} catch (err) {
			startError = err instanceof Error ? err.message : 'Could not start the match'
		} finally {
			starting = false
		}
	}

	const copyCode = async () => {
		if (!browser || !navigator.clipboard) return
		try {
			await navigator.clipboard.writeText(data.session)
		} catch {
			// clipboard may be denied — ignore
		}
	}

	let pollTimer: ReturnType<typeof setInterval> | null = null
	let tickTimer: ReturnType<typeof setInterval> | null = null
	let conn: RealtimeConnection | null = null

	onMount(() => {
		if (!browser) return
		void poll()
		pollTimer = setInterval(poll, POLL_INTERVAL)
		tickTimer = setInterval(() => (now = Date.now()), TICK_INTERVAL)

		// Realtime accelerates the poll: the join/skip that changes lobby state
		// pushes a `{ lobby }` payload on the shared game channel. Best-effort —
		// the mock gateway has no realtime, so polling carries the lobby alone.
		const c = new RealtimeConnection({ channels: [`game:${data.session}`] })
		c.subscribe(`game:${data.session}`, (message: RealtimeMessage) => {
			const lobby = (
				message.payload as {
					lobby?: { count?: number; startAt?: number | null }
				}
			)?.lobby
			if (lobby) {
				applyState(lobby)
				// Any lobby push may carry a seat/side change (pick/assign/lock) that
				// doesn't move the count — refresh so it shows immediately.
				if (browser) void invalidateAll()
			}
		})
		c.open()
			.then(() => (conn = c))
			.catch(() => c.close())
	})

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer)
		if (tickTimer) clearInterval(tickTimer)
		conn?.close()
	})
</script>

<ContentWithFooter>
	<Header />

	<div class="container py-8 max-w-2xl space-y-8">
		<header>
			<p class="section-eyebrow">Multiplayer</p>
			<h1 class="mt-1 text-3xl font-semibold tracking-tight text-foreground">Game lobby</h1>
			<p class="text-sm text-muted-foreground mt-1">
				{isHost ? 'You created this room.' : 'You joined this room.'} Map
				<span class="font-mono">{data.mapId}</span>
			</p>
			<p class="mt-2 flex flex-wrap items-center gap-2" data-testid="lobby-mode">
				{#if isAsync}
					<span
						class="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium px-2.5 py-1"
					>
						<Icon icon="lucide:hourglass" width={12} />
						Async game{turnClockLabel ? ` · ${turnClockLabel} per turn` : ''}
					</span>
					<span class="text-xs text-muted-foreground">
						Play at your own pace. You get an email when it is your move, and a turn left unfinished
						past the clock is resigned automatically.
					</span>
				{:else}
					<span
						class="inline-flex items-center gap-1.5 rounded-full bg-muted text-muted-foreground text-xs font-medium px-2.5 py-1"
					>
						<Icon icon="lucide:zap" width={12} />
						Live game
					</span>
				{/if}
			</p>
		</header>

		<section class="card p-6 sm:p-8 space-y-5">
			<div class="space-y-1">
				<h2 class="text-lg font-semibold tracking-tight text-foreground">Invite a player</h2>
				<p class="text-sm text-muted-foreground">
					Share this code so a friend can join before the match begins.
				</p>
			</div>

			<div class="flex flex-wrap items-center gap-2">
				<code
					data-testid="session-code"
					class="px-3 py-2 rounded-md bg-muted text-foreground font-mono text-sm tracking-wide"
				>
					{data.session}
				</code>
				<button type="button" class="btn btn-outline btn-sm" onclick={copyCode}>
					<Icon icon="lucide:copy" width={14} />
					Copy
				</button>
			</div>
		</section>

		{#if data.thumbnail}
			<section class="card overflow-hidden">
				<div class="max-h-72 overflow-auto bg-surface-2">
					<img
						src={cachedImage(data.thumbnail)}
						alt="{data.mapName} preview"
						class="w-full object-contain"
					/>
				</div>
				<div class="px-4 py-2 text-xs text-muted-foreground">
					{data.mapName} — scroll to look around the map
				</div>
			</section>
		{/if}

		<section class="card p-6 sm:p-8 space-y-5">
			<div class="flex items-center justify-between gap-4">
				<h2 class="text-lg font-semibold tracking-tight text-foreground">Sides</h2>
				<span class="text-sm text-muted-foreground font-mono">{count} / {maxPlayers}</span>
			</div>

			{#if isHost}
				<label class="flex items-center gap-2 text-sm text-muted-foreground">
					<input
						type="checkbox"
						checked={data.lockRandom}
						disabled={lobbyBusy}
						onchange={toggleLock}
					/>
					Lock all seats to random (no one picks a side)
				</label>
			{/if}

			<ul class="space-y-2" data-testid="lobby-seats">
				{#each teams as team (team)}
					{@const holder = memberByTeam.get(team)}
					<li class="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
						<span class="w-2.5 h-2.5 rounded-full shrink-0 {sideOf(team).dot}"></span>
						<span class="font-medium text-foreground w-14 shrink-0">{sideOf(team).name}</span>

						{#if holder}
							{#if holder.isAi}
								<Icon icon="lucide:bot" width={16} class="text-muted-foreground" />
							{:else if holder.user}
								<UserIcon user={holder.user} noClick size={1.5} />
							{/if}
							{#if holder.user && !holder.isMe}
								<button
									type="button"
									class="text-foreground hover:underline"
									onclick={() => holder.user && openDmWith.set(holder.user.auth)}
								>
									{nameOf(holder)}
								</button>
							{:else}
								<span class="text-foreground">{nameOf(holder)}</span>
							{/if}

							{#if data.requiresReady && !holder.isAi}
								<span
									class="text-xs font-medium px-2 py-0.5 rounded-full {readyOf(holder)
										? 'bg-primary/10 text-primary'
										: 'bg-muted text-muted-foreground'}"
									data-testid="seat-ready"
								>
									{readyOf(holder) ? 'Ready' : 'Not ready'}
								</span>
							{/if}

							<span class="ml-auto flex items-center gap-2">
								{#if holder.isMe}
									<button
										type="button"
										class="btn btn-ghost btn-xs"
										disabled={lobbyBusy}
										onclick={goRandom}>Go random</button
									>
								{/if}
								{#if isHost && !holder.isMe}
									<button
										type="button"
										class="btn btn-ghost btn-xs text-destructive"
										disabled={lobbyBusy}
										onclick={() => removeMember(holder.userSession)}
									>
										{holder.isAi ? 'Remove AI' : 'Kick'}
									</button>
								{/if}
							</span>
						{:else}
							<span class="ml-auto flex items-center gap-2">
								<button
									type="button"
									class="btn btn-outline btn-xs"
									disabled={lobbyBusy || (data.lockRandom && !isHost)}
									onclick={() => takeSide(team)}
								>
									Take side
								</button>
								{#if isHost && count < maxPlayers && !isAsync}
									<!-- CPU seats are live-only: an async AI turn would just time out
									     whenever its human driver is offline. -->
									<button
										type="button"
										class="btn btn-ghost btn-xs"
										disabled={lobbyBusy}
										onclick={() => addAi(team)}
									>
										<Icon icon="lucide:bot" width={13} /> Add AI
									</button>
								{/if}
							</span>
						{/if}
					</li>
				{/each}
			</ul>

			{#if randomMembers.length}
				<div class="space-y-2">
					<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Random</p>
					{#each randomMembers as m (m.userSession)}
						<div class="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-2 text-sm">
							{#if m.isAi}
								<Icon icon="lucide:bot" width={16} class="text-muted-foreground" />
							{:else if m.user}
								<UserIcon user={m.user} noClick size={1.5} />
							{/if}
							<span class="text-foreground">{nameOf(m)}</span>
							{#if data.requiresReady && !m.isAi}
								<span
									class="text-xs font-medium px-2 py-0.5 rounded-full {readyOf(m)
										? 'bg-primary/10 text-primary'
										: 'bg-muted text-muted-foreground'}"
								>
									{readyOf(m) ? 'Ready' : 'Not ready'}
								</span>
							{/if}
							<span class="ml-auto flex items-center gap-2">
								{#if isHost && !m.isMe}
									<button
										type="button"
										class="btn btn-ghost btn-xs text-destructive"
										disabled={lobbyBusy}
										onclick={() => removeMember(m.userSession)}
									>
										{m.isAi ? 'Remove AI' : 'Kick'}
									</button>
								{/if}
							</span>
						</div>
					{/each}
				</div>
			{/if}

			{#if lobbyError}
				<p class="text-sm text-destructive">{lobbyError}</p>
			{/if}

			{#if remainingSecs != null}
				<div
					class="flex items-center gap-3 rounded-md bg-primary/5 border border-primary/30 p-3"
					data-testid="lobby-countdown"
				>
					<Icon icon="lucide:timer" width={18} class="text-primary" />
					<p class="text-sm text-foreground">
						Starting in <span class="font-mono font-semibold">{remainingSecs}s</span>…
					</p>
				</div>
			{:else if waitingOnReady}
				<!-- The room is full but nothing has started: every human seat has to
				     confirm first, so a match never opens on someone who looked away. -->
				<div
					class="flex items-center gap-3 rounded-md bg-surface-2 border border-border p-3"
					data-testid="lobby-ready-gate"
				>
					<Icon icon="lucide:hand" width={18} class="text-muted-foreground" />
					<p class="text-sm text-foreground">
						{myReady ? 'Waiting for your opponent to ready up.' : 'Ready up when you are set.'}
						<span class="text-muted-foreground font-mono">({readyCount}/{humanCount} ready)</span>
					</p>
				</div>
			{:else}
				<p class="flex items-center gap-2 text-sm text-muted-foreground">
					<Icon icon="lucide:loader" width={16} class="animate-spin" />
					Waiting for {emptySeats === 1 ? 'another player' : `${emptySeats} more players`} to join…
					{#if data.canFillWithAi && isHost}
						<span class="text-foreground">
							Or start now and the {emptySeats === 1 ? 'open side' : 'open sides'} will be played by the
							CPU.
						</span>
					{/if}
				</p>
			{/if}

			{#if startError}
				<p
					class="flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/30 rounded-md p-3"
				>
					<Icon icon="lucide:circle-x" width={16} class="mt-0.5 shrink-0" />
					{startError}
				</p>
			{/if}

			<div class="flex flex-wrap items-center justify-end gap-2 pt-1">
				<a href="/rooms" class="btn btn-ghost btn-sm">
					<Icon icon="lucide:arrow-left" width={14} />
					Back to rooms
				</a>
				{#if data.requiresReady}
					<!-- Stays available during the countdown too: cancelling stands the
					     clock back down, so a last-second "wait" still works. -->
					<!-- Available in a half-empty room too: readying up is what clears the
					     host to launch with CPUs on the sides nobody took. -->
					<button
						type="button"
						class="btn btn-sm {myReady ? 'btn-outline' : 'btn-primary'}"
						onclick={toggleReady}
						disabled={lobbyBusy}
						data-testid="ready-toggle"
					>
						<Icon icon={myReady ? 'lucide:check' : 'lucide:hand'} width={14} />
						{myReady ? 'Cancel ready' : "I'm ready"}
					</button>
				{/if}
				{#if isHost && canHostStart}
					<!-- Skips the remaining grace once everyone has agreed to play — and on
					     a room that never filled, hands the open sides to the CPU. -->
					<button
						type="button"
						class="btn btn-primary btn-sm"
						onclick={startNow}
						disabled={starting}
						data-testid="start-now"
					>
						<Icon icon="lucide:play" width={14} />
						{starting
							? 'Starting…'
							: full
								? 'Start now'
								: `Start with ${emptySeats} CPU${emptySeats === 1 ? '' : 's'}`}
					</button>
				{/if}
			</div>
		</section>
	</div>
</ContentWithFooter>

<!-- Realtime group chat while the room fills; click a name to open a private DM. -->
<GameChat session={data.session} roster={data.roster ?? []} />
