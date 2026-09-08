<script lang="ts">
	import Icon from '@iconify/svelte'
	import { goto } from '$app/navigation'
	import { gameState } from '../gameState'
	import { relayBacklog } from '../relayBacklog'
	import { turnTransitionActive } from './turnTransitionStore'

	interface Props {
		onEndTurn?: () => void
		/** Whether the side currently holding the turn is one this client commands.
		 * The parent owns this (it knows localTeam, the CPU seats and whether the
		 * match is online); the button only renders the answer. It used to be
		 * derived here from a `cpuOpponent` flag, which was false for every ONLINE
		 * match — so the button stayed live on the opponent's turn, ended their turn
		 * on this board only, and desynced the match. */
		canEndTurn?: boolean
		/** Async games have other pending matches waiting on this player, so
		 * "opponent's turn" here is dead time rather than a match to sit through —
		 * the button becomes a way to jump to whichever of those needs a move. */
		asyncGame?: boolean
		/** This room, so the "next game" lookup can rule it out as an answer. */
		session?: string
		/** Collapsed rail: icon-only. */
		compact?: boolean
	}

	let {
		onEndTurn = () => {},
		canEndTurn = true,
		asyncGame = false,
		session = undefined,
		compact = false,
	}: Props = $props()

	let snapshot = $derived($gameState)
	let waiting = $derived(snapshot.phase === 'playing' && !canEndTurn)
	// Once it's not this client's move, an async match has nothing left for the
	// player to do here at all, so the button hands off to whatever DOES need
	// them instead of just sitting disabled.
	let showNextGame = $derived(asyncGame && waiting)
	// A turn is over on this screen the instant it's clicked, but the moves behind
	// it are still going out one relay at a time. Leaving the board in that window
	// is how a half-relayed turn gets abandoned — and the jump can't pick a
	// sensible destination anyway, because the handover it would be chosen from
	// hasn't reached the room yet. Wait for the backlog to clear.
	let sending = $derived(showNextGame && $relayBacklog > 0)
	let disabled = $derived(
		snapshot.phase !== 'playing' ||
			(!canEndTurn && !showNextGame) ||
			sending ||
			$turnTransitionActive
	)
	let seeking = $state(false)
	// Say *why* the button is dead rather than just greying out — waiting on the
	// other side is the common case and used to look like a broken button.
	let label = $derived(
		snapshot.phase !== 'playing'
			? 'Match over'
			: showNextGame
				? sending
					? 'Sending your turn…'
					: seeking
						? 'Finding next game…'
						: 'Next game'
				: !canEndTurn
					? "Opponent's turn"
					: 'End Turn'
	)

	/** Jump to whichever other async game is waiting on this player's move, if
	 * any — otherwise to their games list, since there's nothing else to do here
	 * until the opponent moves.
	 *
	 * Straight to the board: matches are addressed by room now, so this no
	 * longer has to re-point the player's "current game" and bounce them
	 * through a lobby to get there. */
	const goToNextGame = async () => {
		if (seeking) return
		seeking = true
		try {
			const query = session ? `?exclude=${encodeURIComponent(session)}` : ''
			const res = await fetch(`/api/game/next-async-turn${query}`)
			const body = await res.json().catch(() => null)
			const next: string | null = body?.session ?? null
			// Never route back to the board we're standing on: `goto` to the current
			// URL is a no-op, so the player clicks a button and nothing whatsoever
			// happens. The endpoint already excludes it; this is the belt to that
			// braces, for a client that couldn't name its own session.
			await goto(next && next !== session ? `/play/${next}` : '/games')
		} catch {
			await goto('/games')
		} finally {
			seeking = false
		}
	}

	const handleClick = () => (showNextGame ? goToNextGame() : onEndTurn())
</script>

<button
	type="button"
	class="group flex w-full items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:cursor-not-allowed {compact
		? 'h-8 px-0 text-xs'
		: 'px-3 py-2 text-sm'} {disabled
		? 'bg-white/5 text-white/35'
		: 'bg-emerald-500/90 text-emerald-950 shadow-sm hover:bg-emerald-400'}"
	data-testid="end-turn-button"
	title={label}
	aria-label={label}
	{disabled}
	onclick={handleClick}
>
	{#if compact}
		<Icon icon={showNextGame ? 'mdi:arrow-right-bold' : 'mdi:skip-next'} width="18" height="18" />
		<span class="sr-only">{label}</span>
	{:else}
		<span class="truncate">{label}</span>
		{#if !disabled}
			<Icon icon={showNextGame ? 'mdi:arrow-right-bold' : 'mdi:skip-next'} width="16" height="16" />
		{/if}
	{/if}
</button>
