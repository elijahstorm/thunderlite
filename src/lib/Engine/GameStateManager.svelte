<script lang="ts">
	import type { socketSelect } from '$lib/Components/Socket/socket'
	import { gameState, initGameStateFromMap } from './gameState'

	export let interactor: undefined | ReturnType<typeof socketSelect>
	// Sessions are wired in from the page but are not used here yet — they
	// will feed into networked turn ownership in a later card.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	export let userSession: string
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	export let gameSession: string
	export let map: MapObject | undefined = undefined

	let state: 'waiting' | 'animating' | 'overlay' = 'waiting'
	let active = false

	let lastMap: MapObject | undefined
	$: if (map && map !== lastMap) {
		lastMap = map
		initGameStateFromMap(map)
	}

	$: currentPlayer = $gameState.players.find((p) => p.team === $gameState.currentTeam)
	$: turnLabel =
		$gameState.phase === 'gameOver'
			? `Game Over${
					typeof $gameState.winner === 'number' ? ` — Player ${$gameState.winner + 1} wins` : ''
			  }`
			: `Turn ${$gameState.turnNumber} — Player ${($gameState.currentTeam ?? 0) + 1}${
					currentPlayer?.name ? ` (${currentPlayer.name})` : ''
			  }`

	const select = (x: number, y: number) => {
		if (!interactor) return
		if (state !== 'waiting') return
		if (active) return

		interactor(x, y)
	}
</script>

<slot {select} />

<div
	class="fixed left-4 top-4 px-3 py-1 rounded bg-black/70 text-white text-sm font-mono pointer-events-none select-none z-50"
	data-testid="turn-pill"
>
	{turnLabel}
</div>
