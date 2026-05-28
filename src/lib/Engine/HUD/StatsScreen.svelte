<script lang="ts">
	import { onDestroy, onMount } from 'svelte'
	import { gameState } from '../gameState'
	import { defeatAnimating } from '../defeat'
	import { onMatchEnd, lastMatchResult, type MatchResult } from '../matchEnd'
	import type { PlayerMatchStats } from '../matchStats'

	/** The team controlled on this machine — used to frame the banner as Victory/Defeat. */
	export let localTeam = 0
	/** Restart the same board (hotseat/online). Optional; button hidden when absent. */
	export let onRematch: (() => void) | undefined = undefined
	/** Advance to the next campaign level (campaign win). Wired by K4. */
	export let onContinue: (() => void) | undefined = undefined
	/** Reload the same campaign level (campaign loss). Wired by K4. */
	export let onRetry: (() => void) | undefined = undefined
	/** Where "Exit to rooms" points (online/hotseat). */
	export let roomsHref = '/rooms'
	/** Where "Exit to campaign" points (campaign). */
	export let campaignHref = '/campaign'

	// The screen never computes the outcome itself (J1 owns that). It subscribes to
	// the match-end event for fresh results and falls back to the last emitted
	// result if it mounted after the terminal moment. Visibility is driven purely
	// by the authoritative game phase, so a new match (phase → playing) hides it.
	let live: MatchResult | null = null
	let off: (() => void) | undefined
	onMount(() => {
		off = onMatchEnd((r) => (live = r))
	})
	onDestroy(() => off?.())

	// Hold the results screen back while a defeated army is still blowing up, so
	// those explosions are actually visible before the banner covers the board.
	$: result =
		$gameState.phase === 'gameOver' && $defeatAnimating === 0 ? (live ?? lastMatchResult()) : null

	const STAT_COLUMNS: { key: keyof PlayerMatchStats; label: string }[] = [
		{ key: 'unitsBuilt', label: 'Built' },
		{ key: 'unitsLost', label: 'Lost' },
		{ key: 'damageDealt', label: 'Damage' },
		{ key: 'tilesCaptured', label: 'Captures' },
		{ key: 'turnsTaken', label: 'Turns' },
	]

	// Stats by team for O(1) row lookup; missing teams read as zeroed.
	$: statsByTeam = new Map(
		(result?.stats ?? []).map((s) => [s.team as number, s as unknown as PlayerMatchStats])
	)
	const statValue = (team: number, key: keyof PlayerMatchStats): number => {
		const row = statsByTeam.get(team)
		const v = row?.[key]
		return typeof v === 'number' ? v : 0
	}

	// Player display names come from live game state, keyed by team.
	$: nameByTeam = new Map($gameState.players.map((p) => [p.team, p.name]))

	$: isDraw = result?.winner === null || result?.winner === undefined
	$: localWon = result != null && !isDraw && result.winner === localTeam
	$: banner = result == null ? '' : isDraw ? 'Draw' : localWon ? 'Victory' : 'Defeat'
	$: bannerDetail =
		result == null || isDraw ? 'No winner' : `Player ${(result.winner as number) + 1} wins`

	$: isCampaign = result?.mode === 'campaign'

	// Campaign win → Continue (auto-advance to the next level, decided by the host
	// route). Campaign loss/draw → Retry (reload the same level).
	const handleContinue = () => onContinue?.()
	const handleRetry = () => onRetry?.()
</script>

{#if result}
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
		data-testid="stats-screen"
	>
		<div
			class="pointer-events-auto flex min-w-[340px] max-w-[90vw] flex-col gap-4 rounded bg-black/90 p-6 text-white font-mono"
		>
			<header class="flex flex-col items-center gap-1">
				<h2
					class="text-2xl font-bold"
					class:text-emerald-400={localWon}
					class:text-rose-400={!isDraw && !localWon}
					data-testid="stats-banner"
				>
					{banner}
				</h2>
				<div class="text-sm opacity-80" data-testid="stats-banner-detail">{bannerDetail}</div>
			</header>

			<table class="w-full border-collapse text-sm" data-testid="stats-table">
				<thead>
					<tr class="text-left opacity-70">
						<th class="py-1 pr-3 font-normal">Player</th>
						<th class="py-1 pr-3 font-normal">Result</th>
						{#each STAT_COLUMNS as col (col.key)}
							<th class="py-1 pr-3 text-right font-normal">{col.label}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each result.players as player (player.team)}
						<tr
							class="border-t border-white/10"
							class:text-emerald-300={player.outcome === 'win'}
							class:font-bold={player.outcome === 'win'}
							data-testid="stats-row"
							data-team={player.team}
							data-outcome={player.outcome}
						>
							<td class="py-1 pr-3">
								Player {player.team + 1}{nameByTeam.get(player.team)
									? ` (${nameByTeam.get(player.team)})`
									: ''}
							</td>
							<td class="py-1 pr-3 capitalize">{player.outcome}</td>
							{#each STAT_COLUMNS as col (col.key)}
								<td class="py-1 pr-3 text-right">{statValue(player.team, col.key)}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>

			<footer class="mt-1 flex justify-center gap-3">
				{#if isCampaign}
					{#if localWon}
						<button
							type="button"
							class="rounded bg-emerald-500/80 px-4 py-2 text-sm hover:bg-emerald-500"
							on:click={handleContinue}
							data-testid="stats-continue"
						>
							Continue
						</button>
					{:else}
						<button
							type="button"
							class="rounded bg-amber-500/80 px-4 py-2 text-sm hover:bg-amber-500"
							on:click={handleRetry}
							data-testid="stats-retry"
						>
							Retry
						</button>
					{/if}
					<a
						href={campaignHref}
						class="rounded bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
						data-testid="stats-exit-campaign"
					>
						Exit to campaign
					</a>
				{:else}
					{#if onRematch}
						<button
							type="button"
							class="rounded bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
							on:click={onRematch}
							data-testid="stats-rematch"
						>
							Rematch
						</button>
					{/if}
					<a
						href={roomsHref}
						class="rounded bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
						data-testid="stats-exit-rooms"
					>
						Exit to rooms
					</a>
				{/if}
			</footer>
		</div>
	</div>
{/if}
