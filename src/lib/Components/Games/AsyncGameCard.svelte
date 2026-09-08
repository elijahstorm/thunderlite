<script lang="ts">
	import Icon from '@iconify/svelte'
	import UserIcon from '$lib/Components/Auth/UserIcon.svelte'
	import RatingBadge from '$lib/Components/Profile/RatingBadge.svelte'
	import AsyncGamePreview from '$lib/Components/Rooms/AsyncGamePreview.svelte'
	import InviteLink from '$lib/Components/Games/InviteLink.svelte'
	import { formatAgo, formatTimeLeft, formatTurnTimeout, turnUrgency } from '$lib/Game/asyncConfig'

	/**
	 * One correspondence game, as it appears on the games hub. Three states, all
	 * of them the same card so the list reads as one thing:
	 *
	 *  - your move      — accented, the deadline is yours, the CTA plays
	 *  - their move     — quiet, the deadline is theirs, the CTA reviews
	 *  - filling        — no board yet, so the card is the invite instead
	 */
	export type AsyncGameView = {
		session: string
		mapName: string
		started: boolean
		yourTurn: boolean
		turnDeadline: number | null
		turnTimeoutMs: number
		filled: number
		capacity: number
		isHost: boolean
		lastUpdated: number | null
		opponent: UserDBData | null
	}

	interface Props {
		game: AsyncGameView
		/** Ticked by the page so every card's countdown reads down together. */
		now: number
		onleave?: (session: string) => void
		leaving?: boolean
	}

	let { game, now, onleave, leaving = false }: Props = $props()

	let msLeft = $derived(game.turnDeadline != null ? game.turnDeadline - now : null)
	let urgency = $derived(game.started ? turnUrgency(msLeft) : 'calm')
	let opponentName = $derived(
		game.opponent?.display_name || game.opponent?.username || (game.started ? 'Opponent' : null)
	)

	// The deadline's tone tracks who it threatens. A clock running down on the
	// opponent is information; one running down on you is a call to action, so
	// only your own turn is allowed to shout.
	let clockClass = $derived(
		!game.yourTurn
			? 'text-muted-foreground'
			: urgency === 'expired' || urgency === 'critical'
				? 'text-destructive'
				: urgency === 'soon'
					? 'text-amber-500'
					: 'text-muted-foreground'
	)
</script>

<article
	class="card p-4 sm:p-5 transition-colors {game.yourTurn
		? 'border-primary/40 bg-primary/[0.03]'
		: ''}"
	data-testid="async-game-card"
	data-session={game.session}
>
	<div class="flex items-start gap-4">
		{#if game.started}
			<a
				href="/play/{game.session}"
				class="shrink-0 rounded-md outline-none transition-transform hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-ring"
				aria-label="Open {game.mapName}"
			>
				<AsyncGamePreview session={game.session} yourTurn={game.yourTurn} />
			</a>
		{:else}
			<div
				class="shrink-0 grid place-items-center rounded-md border border-dashed border-border bg-muted/30 text-muted-foreground"
				style="width: 72px; height: 72px"
			>
				<Icon icon="lucide:user-plus" width={20} />
			</div>
		{/if}

		<div class="min-w-0 flex-1 space-y-1.5">
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<h3 class="truncate text-sm font-semibold text-foreground">{game.mapName}</h3>
					<div class="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
						{#if game.opponent}
							<UserIcon user={game.opponent} noClick size={1.1} />
						{/if}
						{#if opponentName}
							<span class="truncate">vs {opponentName}</span>
							<RatingBadge elo={game.opponent?.elo} size="xs" hideUnrated />
						{:else}
							<span>{formatTurnTimeout(game.turnTimeoutMs)} per turn</span>
						{/if}
					</div>
				</div>
			</div>

			<p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs {clockClass}">
				{#if !game.started}
					<span class="text-muted-foreground">
						Waiting for {game.capacity - game.filled === 1
							? 'a player'
							: `${game.capacity - game.filled} players`} to join
					</span>
					<span class="text-muted-foreground/60">·</span>
					<span class="text-muted-foreground font-mono">{game.filled}/{game.capacity}</span>
				{:else if msLeft != null}
					<Icon
						icon={urgency === 'critical' || urgency === 'expired'
							? 'lucide:alarm-clock'
							: 'lucide:clock'}
						width={12}
					/>
					<span class="font-medium">
						{#if urgency === 'expired'}
							Out of time
						{:else}
							{formatTimeLeft(msLeft)} {game.yourTurn ? 'left to move' : 'left for them'}
						{/if}
					</span>
					{#if game.lastUpdated != null}
						<span class="text-muted-foreground/60">·</span>
						<span class="text-muted-foreground">last move {formatAgo(game.lastUpdated)}</span>
					{/if}
				{:else}
					<span class="text-muted-foreground">{formatTurnTimeout(game.turnTimeoutMs)} per turn</span
					>
				{/if}
			</p>
		</div>

		<div class="flex shrink-0 flex-col items-end gap-1 self-center">
			{#if game.started}
				<a
					href="/play/{game.session}"
					class="btn {game.yourTurn ? 'btn-primary' : 'btn-outline btn-sm'}"
				>
					<Icon icon={game.yourTurn ? 'lucide:swords' : 'lucide:eye'} width={14} />
					{game.yourTurn ? 'Take turn' : 'Review'}
				</a>
			{:else}
				<InviteLink session={game.session} variant="compact" label="Copy invite" />
				{#if game.isHost && onleave}
					<button
						type="button"
						class="btn btn-ghost btn-xs text-muted-foreground hover:text-destructive"
						disabled={leaving}
						onclick={() => onleave?.(game.session)}
					>
						{leaving ? 'Cancelling…' : 'Cancel game'}
					</button>
				{/if}
			{/if}
		</div>
	</div>
</article>
