<script lang="ts">
	import Icon from '@iconify/svelte'
	import FallbackImage from '$lib/Components/Images/FallbackImage.svelte'
	import type { MatchHistoryEntry, MatchHistoryOpponent } from '$lib/Database/getMatchHistory'

	interface Props {
		/**
		 * Finished matches, newest first (see getMatchHistory). Shared between the
		 * full `/my/games` log and the recent-games strip on `/me`, so it renders
		 * only the list; headers, pagination and empty states belong to the page.
		 */
		entries: MatchHistoryEntry[]
	}

	let { entries }: Props = $props()

	const outcomeLabel: Record<MatchHistoryEntry['outcome'], string> = {
		win: 'Victory',
		loss: 'Defeat',
		draw: 'Draw',
	}
	const outcomeChip: Record<MatchHistoryEntry['outcome'], string> = {
		win: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
		loss: 'bg-red-500/10 text-red-600 dark:text-red-400',
		draw: 'bg-muted text-muted-foreground',
	}
	const modeLabel: Record<MatchHistoryEntry['mode'], string> = {
		online: 'Online',
		hotseat: 'Hot-seat',
		campaign: 'Campaign',
	}

	const formatDate = (date: Date | string) =>
		new Date(date).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		})

	const opponentName = (opponent: MatchHistoryOpponent): string =>
		opponent.displayName || opponent.username || 'Unknown player'

	// The headline is who you fought: the first opponent for online play, the
	// mode itself when there is nobody to name.
	const title = (entry: MatchHistoryEntry): string => {
		const opponent = entry.opponents[0]
		if (opponent) return `vs ${opponentName(opponent)}`
		if (entry.mode === 'campaign') return 'Campaign mission'
		if (entry.mode === 'hotseat') return 'Hot-seat match'
		return 'Online match'
	}

	const eloChip = (delta: number): string =>
		delta > 0
			? 'text-emerald-600 dark:text-emerald-400'
			: delta < 0
				? 'text-red-600 dark:text-red-400'
				: 'text-muted-foreground'
</script>

<ul class="space-y-3" data-testid="match-history">
	{#each entries as entry (entry.matchId)}
		<li>
			<article class="card flex flex-wrap items-center gap-3 p-4 sm:gap-4 sm:p-5">
				<span
					class="inline-flex w-20 justify-center rounded-full px-2.5 py-1 text-xs font-semibold {outcomeChip[
						entry.outcome
					]}"
					data-testid="match-outcome"
				>
					{outcomeLabel[entry.outcome]}
				</span>

				<div class="min-w-0 flex-1">
					<div class="flex flex-wrap items-center gap-2">
						{#if entry.opponents[0]}
							{@const opponent = entry.opponents[0]}
							<a
								href="/users/{opponent.auth}"
								class="flex items-center gap-2 font-medium text-foreground hover:underline underline-offset-4"
							>
								<span class="block h-6 w-6 shrink-0 overflow-hidden rounded-full bg-muted">
									<FallbackImage
										src={opponent.avatarUrl}
										alt="{opponentName(opponent)} profile"
										cover
									/>
								</span>
								{title(entry)}
							</a>
							{#if entry.opponents.length > 1}
								<span class="text-xs text-muted-foreground">
									and {entry.opponents.length - 1} more
								</span>
							{/if}
						{:else}
							<span class="font-medium text-foreground">{title(entry)}</span>
						{/if}

						{#if entry.eloDelta != null}
							<span
								class="text-xs font-semibold tabular-nums {eloChip(entry.eloDelta)}"
								title="Rating change"
								data-testid="match-elo-delta"
							>
								{entry.eloDelta > 0 ? `+${entry.eloDelta}` : entry.eloDelta}
							</span>
						{/if}
					</div>

					<p class="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
						<span>{modeLabel[entry.mode]}</span>
						{#if entry.mapName}
							<span aria-hidden="true">&middot;</span>
							<span>{entry.mapName}</span>
						{/if}
						{#if entry.turns > 0}
							<span aria-hidden="true">&middot;</span>
							<span>{entry.turns} {entry.turns === 1 ? 'turn' : 'turns'}</span>
						{/if}
						{#if entry.endedAt}
							<span aria-hidden="true">&middot;</span>
							<span>{formatDate(entry.endedAt)}</span>
						{/if}
					</p>
				</div>

				{#if entry.reviewable}
					<a
						class="btn btn-outline btn-sm shrink-0"
						href="/replays/{entry.matchId}"
						data-testid="watch-replay"
					>
						<Icon icon="lucide:play" width={14} />
						Watch replay
					</a>
				{/if}
			</article>
		</li>
	{/each}
</ul>
