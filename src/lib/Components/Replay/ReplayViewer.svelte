<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte'
	import { writable } from 'svelte/store'
	import Icon from '@iconify/svelte'
	import MapRender from '$lib/Map/MapRender.svelte'
	import { rendererStore } from '$lib/Sprites/spriteStore'
	import { gameState, initGameStateFromMap, resetGameState } from '$lib/Engine/gameState'
	import { resetMatchEnd } from '$lib/Engine/matchEnd'
	import {
		dispatchSerializedAction,
		type SerializedAction,
	} from '$lib/Engine/Interactor/serializedAction'
	import { animateRemoteAction } from '$lib/Engine/remoteAnimate'

	/**
	 * ReplayViewer — a read-only board that marches a finished match's event log
	 * (H2's `game_event`) forward action by action. The engine was built for
	 * this: `dispatchSerializedAction` applies silently and deterministically
	 * (the reconnect path replays the same log), and `animateRemoteAction` plays
	 * the same slide/attack choreography a live opponent action gets.
	 *
	 * No GameStateManager mounts here on purpose: it registers the match-end
	 * subscribers (result recording, campaign unlocks) and drives CPU turns, and
	 * a replay must never re-record a result or let an AI move. Win conditions
	 * still flip `gameState.phase` as the log's own terminal action applies,
	 * which is exactly what the "Final" banner reads.
	 *
	 * Seeking backward rebuilds instead of undoing: restore the pristine layers
	 * snapshot (the same idiom as GameStateManager's rematch restore), re-seed
	 * `gameState`, and instant-apply the prefix. All control operations run
	 * through one serial queue so a seek can never interleave with an in-flight
	 * animated step.
	 */

	interface Props {
		map: MapObject
		actions: SerializedAction[]
		/** Team-keyed public labels for the HUD; missing teams fall back to "Player N". */
		seats?: Record<number, { auth: string; name: string; avatarUrl: string | null }>
		mapName?: string
		winnerTeam?: number | null
		menuHref?: string
	}

	let {
		map,
		actions,
		seats = {},
		mapName = '',
		winnerTeam = null,
		menuHref = '/my/games',
	}: Props = $props()

	// A vantage no seat holds: with fog off the whole board renders, and stealth
	// draws as a true outside observer would see it.
	const SPECTATOR_TEAM = -1

	// Base pause between autoplay steps, divided by the speed factor.
	const STEP_GAP_MS = 650
	const SPEEDS = [1, 2, 4] as const

	const contextLoaded = writable(!!$rendererStore.ground[0]?.sprite)

	// Pristine board copy taken before any action applies — the rewind target.
	const initialLayers: MapLayers = untrack(() => structuredClone(map.layers))

	let total = $derived(actions.length)

	let cursor = $state(0)
	let playing = $state(false)
	let speed = $state<number>(1)
	let requestRedraw = $state(0)

	// One serial lane for every control operation (autoplay loop, step, seek):
	// a queued op only starts after the previous one fully settles, so a seek
	// can never rebuild the board underneath a mid-flight animation.
	let opQueue: Promise<void> = Promise.resolve()
	const enqueue = (op: () => void | Promise<void>): void => {
		opQueue = opQueue.then(op).catch(() => {
			// A failed step must not wedge the queue; the next control still runs.
		})
	}

	const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

	const applyInstant = (): void => {
		dispatchSerializedAction(map, actions[cursor])
		cursor += 1
	}

	const runStep = async (animate: boolean): Promise<void> => {
		const action = actions[cursor]
		cursor += 1
		if (animate && (action.kind === 'move' || action.kind === 'attack')) {
			try {
				await animateRemoteAction(map, action)
			} catch {
				// The animator hiccuped; the action itself still committed (or was a
				// no-op against drifted state). Playback carries on.
			}
		} else {
			dispatchSerializedAction(map, action)
		}
		requestRedraw = performance.now()
	}

	/** Rebuild-and-fast-forward. Sync on purpose: runs whole inside one queue slot. */
	const seekTo = (target: number): void => {
		const clamped = Math.max(0, Math.min(total, Math.trunc(target)))
		if (clamped === cursor) return
		if (clamped < cursor) {
			map.layers = structuredClone(initialLayers)
			resetMatchEnd()
			initGameStateFromMap(map)
			cursor = 0
		}
		while (cursor < clamped) applyInstant()
		requestRedraw = performance.now()
	}

	const pause = (): void => {
		playing = false
	}

	const play = (): void => {
		if (playing || cursor >= total) return
		playing = true
		enqueue(async () => {
			while (playing && cursor < total) {
				// Full choreography at watchable speeds; instant steps at 4x so the
				// fixed animation lengths don't cap the pace.
				await runStep(speed < 4)
				if (!playing || cursor >= total) break
				await sleep(STEP_GAP_MS / speed)
			}
			playing = false
		})
	}

	const togglePlay = (): void => {
		if (playing) pause()
		else play()
	}

	const stepForward = (): void => {
		pause()
		enqueue(() => {
			if (cursor < total) {
				applyInstant()
				requestRedraw = performance.now()
			}
		})
	}

	const stepBack = (): void => {
		pause()
		enqueue(() => seekTo(cursor - 1))
	}

	const skipToStart = (): void => {
		pause()
		enqueue(() => seekTo(0))
	}

	const skipToEnd = (): void => {
		pause()
		enqueue(() => seekTo(total))
	}

	const onScrub = (event: Event): void => {
		pause()
		const target = Number((event.currentTarget as HTMLInputElement).value)
		enqueue(() => seekTo(target))
	}

	const cycleSpeed = (): void => {
		const at = SPEEDS.indexOf(speed as (typeof SPEEDS)[number])
		speed = SPEEDS[(at + 1) % SPEEDS.length]
	}

	const teamName = (team: number | null): string => {
		if (team == null) return 'Nobody'
		return seats[team]?.name ?? `Player ${team + 1}`
	}

	const isTyping = (target: EventTarget | null): boolean => {
		const el = target as HTMLElement | null
		if (!el) return false
		return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
	}
	const onKeydown = (event: KeyboardEvent) => {
		if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
		if (isTyping(event.target)) return
		if (event.key === ' ') {
			event.preventDefault()
			togglePlay()
		} else if (event.key === 'ArrowRight') {
			event.preventDefault()
			stepForward()
		} else if (event.key === 'ArrowLeft') {
			event.preventDefault()
			stepBack()
		}
	}

	// Seed the engine store from the pristine board before the first frame; the
	// board pages all own this store while mounted (see GameStateManager).
	untrack(() => {
		resetMatchEnd()
		initGameStateFromMap(map)
	})

	onMount(() => {
		window.addEventListener('keydown', onKeydown)
		return () => window.removeEventListener('keydown', onKeydown)
	})

	onDestroy(() => {
		playing = false
		resetGameState()
	})

	let atEnd = $derived(cursor >= total)
	let currentTeam = $derived($gameState.currentTeam)
</script>

<MapRender
	{map}
	select={undefined}
	{requestRedraw}
	fogOfWar={false}
	localTeam={SPECTATOR_TEAM}
	{contextLoaded}
	backdrop="game-backdrop"
/>

<!-- Top bar: what you're watching and where the log stands. -->
<div
	class="fixed top-2 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full bg-black/70 px-4 py-1.5 text-xs text-white shadow pointer-events-none"
	data-testid="replay-status"
>
	<span class="font-semibold">{mapName || 'Replay'}</span>
	<span aria-hidden="true">&middot;</span>
	{#if atEnd}
		<span class="font-medium">
			{winnerTeam == null ? 'Draw' : `${teamName(winnerTeam)} wins`}
		</span>
	{:else}
		<span>Turn {$gameState.turnNumber}, {teamName(currentTeam)}</span>
	{/if}
	<span aria-hidden="true">&middot;</span>
	<span class="tabular-nums">Move {cursor} / {total}</span>
</div>

<a
	class="fixed top-2 right-2 z-40 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs text-white shadow hover:bg-black/85"
	href={menuHref}
	aria-label="Exit replay"
>
	<Icon icon="lucide:x" width={14} />
	Exit
</a>

<!-- Bottom transport controls. -->
<div
	class="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex w-[min(34rem,calc(100vw-1.5rem))] flex-col gap-2 rounded-xl bg-black/70 px-4 py-3 text-white shadow-lg"
	data-testid="replay-controls"
>
	<input
		type="range"
		class="w-full accent-white"
		min="0"
		max={total}
		step="1"
		value={cursor}
		oninput={onScrub}
		aria-label="Replay position"
	/>
	<div class="flex items-center justify-center gap-2">
		<button class="rounded p-1.5 hover:bg-white/15" onclick={skipToStart} aria-label="Restart">
			<Icon icon="lucide:skip-back" width={18} />
		</button>
		<button class="rounded p-1.5 hover:bg-white/15" onclick={stepBack} aria-label="Previous move">
			<Icon icon="lucide:chevron-left" width={18} />
		</button>
		<button
			class="rounded-full bg-white/90 p-2 text-black hover:bg-white"
			onclick={togglePlay}
			aria-label={playing ? 'Pause' : 'Play'}
			data-testid="replay-play"
		>
			<Icon icon={playing ? 'lucide:pause' : 'lucide:play'} width={18} />
		</button>
		<button class="rounded p-1.5 hover:bg-white/15" onclick={stepForward} aria-label="Next move">
			<Icon icon="lucide:chevron-right" width={18} />
		</button>
		<button class="rounded p-1.5 hover:bg-white/15" onclick={skipToEnd} aria-label="Skip to end">
			<Icon icon="lucide:skip-forward" width={18} />
		</button>
		<button
			class="ml-2 w-10 rounded px-1.5 py-1 text-xs font-semibold tabular-nums hover:bg-white/15"
			onclick={cycleSpeed}
			aria-label="Playback speed"
		>
			{speed}x
		</button>
	</div>
</div>
