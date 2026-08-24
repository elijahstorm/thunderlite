<script lang="ts">
	import type { PageData } from './$types'
	import { browser } from '$app/environment'
	import { goto, invalidateAll } from '$app/navigation'
	import Icon from '@iconify/svelte'
	import Header from '$lib/Components/Branding/Header.svelte'
	import ContentWithFooter from '$lib/Components/PageContainers/ContentWithFooter.svelte'
	import { formatTimeLeft, formatTurnTimeout } from '$lib/Game/asyncConfig'
	import RatingBadge from '$lib/Components/Profile/RatingBadge.svelte'

	interface Props {
		data: PageData
	}

	let { data }: Props = $props()

	let gameData = $derived(data.gameData)
	let asyncGames = $derived(data.myAsyncGames ?? [])

	const opponentName = (g: (typeof asyncGames)[number]) =>
		g.opponent?.display_name || g.opponent?.username || (g.started ? 'Opponent' : null)

	const asyncStatus = (g: (typeof asyncGames)[number]): string => {
		if (!g.started) return 'Waiting for an opponent to join'
		const left = g.turnDeadline != null ? formatTimeLeft(g.turnDeadline - Date.now()) : null
		if (g.yourTurn) return left ? `Your move · ${left} left` : 'Your move'
		return left ? `Their move · ${left} left` : 'Their move'
	}
	let joinCode = $state('')
	let joinStatus: 'idle' | 'sending' | 'error' = $state('idle')
	let joinError = $state('')

	const joinSession = async (session: string) => {
		if (!session) {
			joinStatus = 'error'
			joinError = 'Please enter a session code'
			return
		}
		joinStatus = 'sending'
		joinError = ''
		try {
			const response = await fetch('/api/game/join', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-sveltekit-action': 'true',
				},
				body: JSON.stringify({ session }),
			})
			const body = await response.json().catch(() => null)
			if (!response.ok) {
				throw new Error(body?.message ?? 'Could not join game session')
			}
			if (browser) {
				// Into the lobby, not straight into the match — the host may still be
				// waiting there, and this is where the start countdown plays out.
				goto(`/rooms/${session}`)
				return
			}
			joinStatus = 'idle'
		} catch (err) {
			joinStatus = 'error'
			joinError = err instanceof Error ? err.message : 'Could not join game session'
		}
	}

	const join = () => joinSession(joinCode.trim())

	let leaving = $state(false)
	const leaveActive = async (session: string) => {
		if (leaving) return
		leaving = true
		try {
			await fetch(`/api/game/${session}/leave`, { method: 'POST' }).catch(() => {})
			await invalidateAll()
		} finally {
			leaving = false
		}
	}

	const copyCode = async (code: string) => {
		if (!browser || !navigator.clipboard) return
		try {
			await navigator.clipboard.writeText(code)
		} catch {
			// ignore — clipboard may be denied
		}
	}
</script>

<ContentWithFooter>
	<Header />

	<div class="container py-8 max-w-3xl space-y-8">
		<header>
			<p class="section-eyebrow">Multiplayer</p>
			<h1 class="mt-1 text-3xl font-semibold tracking-tight text-foreground">Rooms</h1>
			<p class="text-sm text-muted-foreground mt-1">
				Signed in as <span class="text-foreground font-medium">{data.user}</span>
			</p>
		</header>

		{#if gameData?.session}
			<section class="card p-6 sm:p-8 space-y-5">
				<div class="space-y-1">
					<h2 class="text-lg font-semibold tracking-tight text-foreground">Your active session</h2>
					<p class="text-sm text-muted-foreground">
						Share this code with a friend so they can join your game.
					</p>
				</div>

				<div class="flex flex-wrap items-center gap-2">
					<code
						data-testid="session-code"
						class="px-3 py-2 rounded-md bg-muted text-foreground font-mono text-sm tracking-wide"
					>
						{gameData.session}
					</code>
					<button
						type="button"
						class="btn btn-outline btn-sm"
						onclick={() => gameData && copyCode(gameData.session)}
					>
						<Icon icon="lucide:copy" width={14} />
						Copy
					</button>
					<a href="/rooms/{gameData.session}" class="btn btn-primary btn-sm">
						<Icon icon="lucide:play" width={14} />
						Go to lobby
					</a>
					<button
						type="button"
						class="btn btn-ghost btn-sm text-destructive"
						disabled={leaving}
						onclick={() => gameData && leaveActive(gameData.session)}
					>
						<Icon icon="lucide:log-out" width={14} />
						{leaving ? 'Leaving…' : 'Leave game'}
					</button>
				</div>

				<p class="text-xs text-muted-foreground">
					Map <span class="font-mono">{gameData.mapId}</span>
				</p>
			</section>
		{:else}
			<section class="card p-6 sm:p-8 flex items-center justify-between gap-4 flex-wrap">
				<div>
					<h2 class="font-medium text-foreground">No active session</h2>
					<p class="text-sm text-muted-foreground mt-1">You don't have a game in progress yet.</p>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<a href="/editor" class="btn btn-outline">
						<Icon icon="lucide:hammer" width={14} />
						Build a map
					</a>
					<a href="/make" class="btn btn-primary">
						<Icon icon="lucide:plus" width={14} />
						Make a game
					</a>
				</div>
			</section>
		{/if}

		{#if asyncGames.length}
			<section class="card p-6 sm:p-8 space-y-5" data-testid="async-games">
				<div class="space-y-1">
					<h2 class="text-lg font-semibold tracking-tight text-foreground">Your async games</h2>
					<p class="text-sm text-muted-foreground">
						Games played over days. You get an email whenever it is your move.
					</p>
				</div>

				<ul class="divide-y divide-border">
					{#each asyncGames as game (game.session)}
						<li class="flex items-center justify-between gap-3 py-3">
							<div class="min-w-0">
								<p class="text-sm font-medium text-foreground truncate">
									{game.mapName}
									{#if opponentName(game)}
										<span class="text-muted-foreground font-normal">
											vs {opponentName(game)}
										</span>
										<RatingBadge elo={game.opponent?.elo} size="xs" hideUnrated />
									{/if}
								</p>
								<p
									class="text-xs font-mono {game.yourTurn
										? 'text-primary'
										: 'text-muted-foreground'}"
								>
									{asyncStatus(game)} · {formatTurnTimeout(game.turnTimeoutMs)}/turn
								</p>
							</div>
							<button
								type="button"
								class="btn btn-sm shrink-0 {game.yourTurn ? 'btn-primary' : 'btn-outline'}"
								disabled={joinStatus === 'sending'}
								onclick={() => joinSession(game.session)}
							>
								<Icon icon="lucide:play" width={14} />
								{game.yourTurn ? 'Take turn' : 'Open'}
							</button>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<section class="card p-6 sm:p-8 space-y-5">
			<div class="space-y-1">
				<h2 class="text-lg font-semibold tracking-tight text-foreground">Join a game</h2>
				<p class="text-sm text-muted-foreground">Paste a session code shared by another player.</p>
			</div>

			<form
				class="flex flex-col sm:flex-row gap-2"
				onsubmit={(e) => {
					e.preventDefault()
					join()
				}}
			>
				<input
					type="text"
					bind:value={joinCode}
					placeholder="Session code"
					autocomplete="off"
					class="input flex-1 font-mono"
					disabled={joinStatus === 'sending'}
				/>
				<button type="submit" class="btn btn-primary" disabled={joinStatus === 'sending'}>
					{joinStatus === 'sending' ? 'Joining…' : 'Join'}
				</button>
			</form>

			{#if joinStatus === 'error' && joinError}
				<p
					class="flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/30 rounded-md p-3"
				>
					<Icon icon="lucide:circle-x" width={16} class="mt-0.5 shrink-0" />
					{joinError}
				</p>
			{/if}
		</section>

		<section class="card p-6 sm:p-8 space-y-5">
			<div class="space-y-1">
				<h2 class="text-lg font-semibold tracking-tight text-foreground">Open games</h2>
				<p class="text-sm text-muted-foreground">
					Public lobbies waiting for a player. Jump into one to fill it.
				</p>
			</div>

			{#if data.openRooms?.length}
				<ul class="divide-y divide-border">
					{#each data.openRooms as room (room.session)}
						<li class="flex items-center justify-between gap-3 py-3">
							<div class="min-w-0">
								<p class="text-sm font-medium text-foreground truncate">
									{room.mapName}
									{#if room.mode === 'async'}
										<span
											class="ml-1 inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[11px] font-medium px-2 py-0.5 align-middle"
										>
											<Icon icon="lucide:hourglass" width={10} />
											Async{room.turnTimeoutMs != null
												? ` · ${formatTurnTimeout(room.turnTimeoutMs)}/turn`
												: ''}
										</span>
									{/if}
								</p>
								<p class="text-xs text-muted-foreground font-mono">
									{room.count}/{room.maxPlayers} · {room.session}
								</p>
							</div>
							<button
								type="button"
								class="btn btn-primary btn-sm shrink-0"
								disabled={joinStatus === 'sending'}
								onclick={() => joinSession(room.session)}
							>
								<Icon icon="lucide:log-in" width={14} />
								Join
							</button>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-sm text-muted-foreground">
					No open games right now. Make one to get started.
				</p>
			{/if}

			{#if data.page > 0 || data.hasMore}
				<div class="flex items-center justify-between pt-1">
					<a
						class="btn btn-outline btn-sm"
						class:pointer-events-none={data.page === 0}
						class:opacity-50={data.page === 0}
						href="/rooms?page={Math.max(0, data.page - 1)}"
					>
						<Icon icon="lucide:chevron-left" width={14} />
						Newer
					</a>
					<span class="text-xs text-muted-foreground">Page {data.page + 1}</span>
					<a
						class="btn btn-outline btn-sm"
						class:pointer-events-none={!data.hasMore}
						class:opacity-50={!data.hasMore}
						href="/rooms?page={data.page + 1}"
					>
						Older
						<Icon icon="lucide:chevron-right" width={14} />
					</a>
				</div>
			{/if}
		</section>
	</div>
</ContentWithFooter>
