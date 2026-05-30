<!--
	TurnTransition — the slide-in card that announces whose turn just started.

	Watches `gameState` for any (turnNumber, currentTeam) change. The first fire
	on mount establishes the baseline and does NOT animate; every change after
	plays the overlay. While the overlay is up, `turnTransitionActive` is true,
	which:
	  - keeps the CPU reactive block (GameStateManager) from spawning a
	    `runCpuTurn` handle, and
	  - gates the local player's `select` + End Turn button.

	Duration is `TURN_TRANSITION_MS`; the in/out fly transitions split that
	window so the card finishes its exit just as the next side-turn unlocks.
-->
<script lang="ts">
	import { fly } from 'svelte/transition'
	import { cubicOut } from 'svelte/easing'
	import { gameState } from '../gameState'
	import { turnTransitionActive, TURN_TRANSITION_MS } from './turnTransitionStore'

	export let localTeam: number = 0
	/** True when other teams are CPU; flips the label between "Enemy" and "Player N". */
	export let cpuOpponent: boolean = false

	// Mirrors the team palette from `imageColorizer.ts` (the second band of each
	// team's gradient — the saturated mid-tone). Keeping a separate copy here is
	// fine: the colorizer's data lives in pixel triples for sprite recolouring,
	// not as CSS-ready strings.
	const TEAM_COLORS = [
		'rgb(233,56,46)', // 0 — red
		'rgb(69,164,225)', // 1 — blue
		'rgb(67,193,56)', // 2 — green
		'rgb(229,229,43)', // 3 — yellow
		'rgb(138,134,139)', // 4 — grey
	]

	let lastKey = ''
	let showing = false
	let shownTeam = 0
	let shownTurn = 1
	let shownMoney = 0
	let timer: ReturnType<typeof setTimeout> | null = null

	$: {
		const s = $gameState
		const key = `${s.currentTeam}:${s.turnNumber}`
		if (key !== lastKey && s.phase === 'playing') {
			const isInitial = lastKey === ''
			lastKey = key
			if (!isInitial) {
				shownTeam = s.currentTeam
				shownTurn = s.turnNumber
				shownMoney = s.players.find((p) => p.team === s.currentTeam)?.money ?? 0
				showing = true
				$turnTransitionActive = true
				if (timer) clearTimeout(timer)
				timer = setTimeout(() => {
					showing = false
					$turnTransitionActive = false
					timer = null
				}, TURN_TRANSITION_MS)
			}
		}
	}

	$: accent = TEAM_COLORS[shownTeam] ?? TEAM_COLORS[0]
	$: label =
		shownTeam === localTeam
			? 'Your Turn'
			: cpuOpponent
				? 'Enemy Turn'
				: `Player ${shownTeam + 1}'s Turn`
</script>

{#if showing}
	<!--
		Wrapper fills the viewport so a tap anywhere is absorbed (defence in
		depth on top of the store-level input gate). The inner card is what
		actually animates.
	-->
	<div
		class="fixed inset-0 z-[80] flex items-center justify-center bg-black/20 backdrop-blur-[2px]"
		data-testid="turn-transition"
	>
		<div
			class="flex items-stretch overflow-hidden rounded-xl bg-black/85 shadow-2xl ring-1 ring-white/10"
			in:fly={{ x: -240, duration: 220, easing: cubicOut }}
			out:fly={{ x: 240, duration: 220, easing: cubicOut }}
		>
			<div class="w-3" style="background: {accent}"></div>
			<div class="flex flex-col items-start gap-1 px-10 py-7 font-mono text-white">
				<div
					class="text-3xl font-bold uppercase tracking-[0.2em]"
					style="color: {accent}"
					data-testid="turn-transition-label"
				>
					{label}
				</div>
				<div class="text-sm opacity-75">Turn {shownTurn} &middot; ${shownMoney}</div>
			</div>
		</div>
	</div>
{/if}
