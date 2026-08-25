<script lang="ts">
	import { onDestroy, onMount } from 'svelte'
	import { fade, fly } from 'svelte/transition'
	import Icon from '@iconify/svelte'
	import { gameState } from '../gameState'
	import { playerRoster } from './playerRoster'
	import { teamColor } from '../teamColors'
	import { defeatAnimating } from '../defeat'
	import { onMatchEnd, lastMatchResult, type MatchResult } from '../matchEnd'
	import type { PlayerMatchStats } from '../matchStats'
	import { isDevMode, downloadDevLog, devLogSize } from '../devLog'
	import { matchRating } from '$lib/Game/matchRating'
	import RatingBadge from '$lib/Components/Profile/RatingBadge.svelte'
	import UserIcon from '$lib/Components/Auth/UserIcon.svelte'

	interface Props {
		/** The team controlled on this machine — used to frame the banner as Victory/Defeat. */
		localTeam?: number
		/** Restart the same board (hotseat/online). Optional; button hidden when absent. */
		onRematch?: (() => void) | undefined
		/** Advance to the next campaign level (campaign win). Wired by K4. */
		onContinue?: (() => void) | undefined
		/** Reload the same campaign level (campaign loss). Wired by K4. */
		onRetry?: (() => void) | undefined
		/** Where "Exit to rooms" points (online/hotseat). */
		roomsHref?: string
		/** Where "Exit to campaign" points (campaign). */
		campaignHref?: string
	}

	let {
		localTeam = 0,
		onRematch = undefined,
		onContinue = undefined,
		onRetry = undefined,
		roomsHref = '/rooms',
		campaignHref = '/campaign',
	}: Props = $props()

	// The screen never computes the outcome itself (J1 owns that). It subscribes to
	// the match-end event for fresh results and falls back to the last emitted
	// result if it mounted after the terminal moment. Visibility is driven purely
	// by the authoritative game phase, so a new match (phase → playing) hides it.
	let live: MatchResult | null = $state(null)
	let off: (() => void) | undefined
	onMount(() => {
		off = onMatchEnd((r) => (live = r))
	})
	onDestroy(() => off?.())

	// Hold the results screen back while a defeated army is still blowing up, so
	// those explosions are actually visible before the banner covers the board.
	let result = $derived(
		$gameState.phase === 'gameOver' && $defeatAnimating === 0 ? (live ?? lastMatchResult()) : null
	)

	const STAT_COLUMNS: { key: keyof PlayerMatchStats; label: string }[] = [
		{ key: 'unitsBuilt', label: 'Built' },
		{ key: 'unitsLost', label: 'Lost' },
		{ key: 'damageDealt', label: 'Damage' },
		{ key: 'tilesCaptured', label: 'Captures' },
		{ key: 'turnsTaken', label: 'Turns' },
	]

	// Stats by team for O(1) row lookup; missing teams read as zeroed.
	let statsByTeam = $derived(
		new Map((result?.stats ?? []).map((s) => [s.team as number, s as unknown as PlayerMatchStats]))
	)
	const statValue = (team: number, key: keyof PlayerMatchStats): number => {
		const row = statsByTeam.get(team)
		const v = row?.[key]
		return typeof v === 'number' ? v : 0
	}

	// Prefer the real player's profile name (online roster, keyed by team) and
	// fall back to the engine's generic label. Keeps the results screen showing
	// "test02" rather than "Player 2".
	let labelFor = $derived((team: number): string => {
		const user = $playerRoster[team]
		if (user) return user.display_name || user.username || `Player ${team + 1}`
		const engineName = $gameState.players.find((p) => p.team === team)?.name
		return engineName || `Player ${team + 1}`
	})

	let isDraw = $derived(result?.winner === null || result?.winner === undefined)
	let localWon = $derived(result != null && !isDraw && result.winner === localTeam)
	let banner = $derived(result == null ? '' : isDraw ? 'Draw' : localWon ? 'Victory' : 'Defeat')
	let bannerDetail = $derived(
		result == null || isDraw ? 'Nobody took the field' : `${labelFor(result.winner as number)} wins`
	)

	let isCampaign = $derived(result?.mode === 'campaign')
	let modeLabel = $derived(
		result?.mode === 'campaign'
			? 'Campaign'
			: result?.mode === 'online'
				? 'Online match'
				: 'Hot-seat'
	)

	// Outcome drives the whole colour story of the report: the accent rail, the
	// headline, and the winning row in the table all read from these.
	let tone = $derived(isDraw ? 'draw' : localWon ? 'win' : 'loss')
	let toneText = $derived(
		tone === 'win' ? 'text-success' : tone === 'loss' ? 'text-destructive' : 'text-foreground'
	)
	let toneRail = $derived(
		tone === 'win' ? 'bg-success' : tone === 'loss' ? 'bg-destructive' : 'bg-border-strong'
	)
	let toneWash = $derived(
		tone === 'win' ? 'from-success/10' : tone === 'loss' ? 'from-destructive/10' : 'from-muted'
	)
	let bannerIcon = $derived(
		tone === 'win' ? 'lucide:trophy' : tone === 'loss' ? 'lucide:shield-off' : 'lucide:handshake'
	)

	const outcomeChip: Record<string, string> = {
		win: 'bg-success/12 text-success',
		loss: 'bg-destructive/10 text-destructive',
		draw: 'bg-muted text-muted-foreground',
	}
	const outcomeLabel: Record<string, string> = { win: 'Won', loss: 'Lost', draw: 'Draw' }

	// Ladder movement, posted back by recordMatch once the server has settled the
	// match. Every settled seat is included, so the report shows the whole
	// exchange ("+12 / -12") rather than only this machine's side.
	let rating = $derived($matchRating)
	let ratingRows = $derived(
		result == null
			? []
			: result.players
					.map((player) => ({ team: player.team, move: rating?.byTeam[player.team] }))
					.filter((row): row is { team: number; move: { before: number; delta: number } } =>
						Boolean(row.move)
					)
					.sort((a, b) => a.team - b.team)
	)

	// A rated game is settled server-side a moment after the board ends, so the
	// section starts as a placeholder for matches that could be rated (online,
	// two human seats) and fills in when the response lands. `settleGaveUp` stops
	// the placeholder from spinning forever when the write failed or the match
	// turned out to be unrated.
	let couldBeRated = $derived(
		result?.mode === 'online' && result.players.length === 2 && !result.players.some((p) => p.isCpu)
	)
	let settleGaveUp = $state(false)
	$effect(() => {
		if (!result || !couldBeRated || ratingRows.length > 0) return
		settleGaveUp = false
		const timer = setTimeout(() => (settleGaveUp = true), 8000)
		return () => clearTimeout(timer)
	})
	let showRatingSection = $derived(
		ratingRows.length > 0 || (couldBeRated && !settleGaveUp && result != null)
	)

	// Campaign win → Continue (auto-advance to the next level, decided by the host
	// route). Campaign loss/draw → Retry (reload the same level).
	const handleContinue = () => onContinue?.()
	const handleRetry = () => onRetry?.()
</script>

{#if result}
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-foreground/50 p-4 backdrop-blur-sm"
		data-testid="stats-screen"
		transition:fade={{ duration: 140 }}
	>
		<div
			class="pointer-events-auto my-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl"
			in:fly={{ y: 18, duration: 260 }}
		>
			<!-- Headline: outcome first, at a size you can read from across the room,
			     over a wash tinted by that same outcome. -->
			<div class="relative bg-gradient-to-b {toneWash} to-transparent">
				<div class="absolute inset-x-0 top-0 h-1 {toneRail}"></div>
				<header class="flex items-start justify-between gap-4 px-6 pb-6 pt-7 sm:px-8">
					<div class="min-w-0">
						<p class="section-eyebrow">{modeLabel}</p>
						<h2
							class="mt-1.5 flex items-center gap-2.5 text-3xl font-semibold tracking-tight sm:text-4xl {toneText}"
							data-testid="stats-banner"
						>
							<Icon icon={bannerIcon} width={30} class="shrink-0" />
							<span>{banner}</span>
						</h2>
						<p class="mt-2 text-sm text-muted-foreground" data-testid="stats-banner-detail">
							{bannerDetail}
						</p>
					</div>
					<span class="chip shrink-0 whitespace-nowrap">
						<Icon icon="lucide:hourglass" width={12} />
						{result.turns}
						{result.turns === 1 ? 'turn' : 'turns'}
					</span>
				</header>
			</div>

			{#if showRatingSection}
				<!-- The numbers people actually came for after a ranked game, shown
				     where the game ends rather than three clicks away on /me. -->
				<section class="border-t border-border px-6 py-5 sm:px-8" data-testid="stats-ratings">
					<div class="mb-3 flex items-baseline justify-between gap-3">
						<p class="section-eyebrow">Rating change</p>
						<span class="text-[11px] text-muted-foreground">Ranked 1v1</span>
					</div>

					{#if ratingRows.length === 0}
						<div
							class="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground"
							data-testid="stats-rating-pending"
						>
							<Icon icon="lucide:loader-circle" width={14} class="animate-spin" />
							Settling the ladder…
						</div>
					{:else}
						<ul class="grid gap-2 sm:grid-cols-2">
							{#each ratingRows as row (row.team)}
								<li
									class="flex items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-3 py-2.5"
									data-testid="stats-rating-row"
									data-team={row.team}
									data-delta={row.move.delta}
								>
									{#if $playerRoster[row.team]}
										<span class="shrink-0">
											<UserIcon user={$playerRoster[row.team]} size={1.4} noClick />
										</span>
									{:else}
										<span
											class="h-2.5 w-2.5 shrink-0 rounded-full"
											style="background:{teamColor(row.team)}"
										></span>
									{/if}
									<span class="min-w-0 flex-1 truncate text-sm font-medium">
										{labelFor(row.team)}
									</span>
									<span class="flex shrink-0 items-center gap-1.5">
										<span class="text-xs tabular-nums text-muted-foreground">{row.move.before}</span
										>
										<Icon icon="lucide:arrow-right" width={12} class="text-muted-foreground/60" />
										<RatingBadge
											elo={row.move.before + row.move.delta}
											delta={row.move.delta}
											size="sm"
										/>
									</span>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/if}

			<!-- How the match was actually won: the per-side ledger. -->
			<section class="border-t border-border">
				<div class="overflow-x-auto">
					<table class="w-full min-w-[34rem] border-collapse text-sm" data-testid="stats-table">
						<thead>
							<tr class="text-xs uppercase tracking-wide text-muted-foreground">
								<th class="px-6 py-2.5 text-left font-medium sm:px-8">Player</th>
								<th class="px-3 py-2.5 text-left font-medium">Result</th>
								{#each STAT_COLUMNS as col (col.key)}
									<th class="px-3 py-2.5 text-right font-medium last:pr-6 sm:last:pr-8">
										{col.label}
									</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each result.players as player (player.team)}
								<tr
									class="border-t border-border {player.outcome === 'win' ? 'bg-success/5' : ''}"
									data-testid="stats-row"
									data-team={player.team}
									data-outcome={player.outcome}
								>
									<td class="px-6 py-3 sm:px-8">
										<span class="flex items-center gap-2.5">
											<span
												class="h-6 w-1 shrink-0 rounded-full"
												style="background:{teamColor(player.team)}"
											></span>
											{#if $playerRoster[player.team]}
												<span class="shrink-0">
													<UserIcon user={$playerRoster[player.team]} size={1.4} noClick />
												</span>
											{/if}
											<span
												class="truncate {player.outcome === 'win'
													? 'font-semibold text-foreground'
													: 'text-foreground/85'}"
											>
												{labelFor(player.team)}
											</span>
											{#if player.isLocal}
												<span class="text-[11px] font-medium text-muted-foreground">(you)</span>
											{/if}
										</span>
									</td>
									<td class="px-3 py-3">
										<span
											class="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold {outcomeChip[
												player.outcome
											]}"
										>
											{outcomeLabel[player.outcome]}
										</span>
									</td>
									{#each STAT_COLUMNS as col (col.key)}
										<td
											class="px-3 py-3 text-right tabular-nums text-foreground/80 last:pr-6 sm:last:pr-8"
										>
											{statValue(player.team, col.key)}
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>

			<footer
				class="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-2 px-6 py-4 sm:px-8"
			>
				{#if isCampaign}
					<a href={campaignHref} class="btn btn-outline" data-testid="stats-exit-campaign">
						Exit to campaign
					</a>
					{#if localWon}
						<button
							type="button"
							class="btn btn-primary"
							onclick={handleContinue}
							data-testid="stats-continue"
						>
							Continue
							<Icon icon="lucide:arrow-right" width={15} />
						</button>
					{:else}
						<button
							type="button"
							class="btn btn-secondary"
							onclick={handleRetry}
							data-testid="stats-retry"
						>
							<Icon icon="lucide:rotate-ccw" width={15} />
							Retry
						</button>
					{/if}
				{:else}
					<a href={roomsHref} class="btn btn-outline" data-testid="stats-exit-rooms">
						Exit to rooms
					</a>
					{#if onRematch}
						<button
							type="button"
							class="btn btn-primary"
							onclick={onRematch}
							data-testid="stats-rematch"
						>
							<Icon icon="lucide:swords" width={15} />
							Rematch
						</button>
					{/if}
				{/if}
			</footer>

			{#if isDevMode}
				<div class="border-t border-border px-6 py-4 sm:px-8">
					<p
						class="mb-2 text-center text-[10px] font-semibold uppercase tracking-wider text-secondary"
					>
						Dev (local only)
					</p>
					<button
						type="button"
						onclick={downloadDevLog}
						class="btn btn-sm mx-auto block bg-secondary/12 text-secondary hover:bg-secondary/20"
					>
						Download game log ({$devLogSize} acts)
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
