<script lang="ts">
	import { goto } from '$app/navigation'
	import Icon from '@iconify/svelte'
	import { audioEngine } from '$lib/Audio/audioEngine'
	import { audioSettings } from '$lib/Stores/audioSettings'
	import { gameState } from '$lib/Engine/gameState'
	import { surrender } from '$lib/Engine/Interactor/interactor'

	export let map: MapObject | undefined = undefined
	export let localTeam = 0
	export let menuHref = '/'

	let open = false
	let view: 'menu' | 'confirmGiveUp' | 'confirmExit' = 'menu'

	$: muted = $audioSettings.master.muted
	$: playing = $gameState.phase === 'playing'

	const toggle = () => {
		open = !open
		view = 'menu'
	}
	const close = () => {
		open = false
		view = 'menu'
	}

	const toggleMute = () => audioEngine.setMasterMute(!$audioSettings.master.muted)

	const giveUp = () => {
		if (map && playing) surrender(map, localTeam)
		close()
	}
	const exitToMenu = async () => {
		// Auto-die so an online opponent isn't left waiting on an abandoned match.
		if (map && playing) surrender(map, localTeam)
		close()
		await goto(menuHref)
	}
</script>

<div class="pointer-events-none fixed left-4 top-4 z-50 flex flex-col items-start gap-2">
	<button
		type="button"
		on:click={toggle}
		aria-label="Game settings"
		aria-expanded={open}
		class="pointer-events-auto rounded-lg bg-black/70 p-2 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-black/85"
	>
		<Icon icon="mdi:cog" width="20" height="20" />
	</button>

	{#if open}
		<div
			class="pointer-events-auto w-56 rounded-lg border border-white/15 bg-neutral-900/95 p-1.5 text-sm text-white shadow-2xl backdrop-blur-md"
			role="menu"
		>
			{#if view === 'menu'}
				<button
					type="button"
					role="menuitem"
					on:click={toggleMute}
					class="flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors hover:bg-white/10"
				>
					<span class="flex items-center gap-2">
						<Icon icon={muted ? 'mdi:volume-off' : 'mdi:volume-high'} width="18" height="18" />
						Sound
					</span>
					<span class="text-xs text-white/60">{muted ? 'Muted' : 'On'}</span>
				</button>

				<div class="my-1 h-px bg-white/10"></div>

				<button
					type="button"
					role="menuitem"
					disabled={!playing}
					on:click={() => (view = 'confirmGiveUp')}
					class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-red-300 transition-colors hover:bg-red-500/15 disabled:opacity-40 disabled:hover:bg-transparent"
				>
					<Icon icon="mdi:flag-variant" width="18" height="18" />
					Give up
				</button>
				<button
					type="button"
					role="menuitem"
					on:click={() => (view = 'confirmExit')}
					class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-white/10"
				>
					<Icon icon="mdi:exit-run" width="18" height="18" />
					Exit to menu
				</button>
			{:else}
				<p class="px-2 py-2 text-xs leading-relaxed text-white/80">
					{#if view === 'confirmGiveUp'}
						Forfeit this match? You'll lose immediately.
					{:else if playing}
						Leave to the menu? This forfeits the match.
					{:else}
						Leave to the menu?
					{/if}
				</p>
				<div class="flex gap-2 px-1 pb-1">
					<button
						type="button"
						on:click={view === 'confirmGiveUp' ? giveUp : exitToMenu}
						class="flex-1 rounded-md bg-red-600 px-3 py-1.5 font-medium transition-colors hover:bg-red-500"
					>
						{view === 'confirmGiveUp' ? 'Give up' : 'Exit'}
					</button>
					<button
						type="button"
						on:click={() => (view = 'menu')}
						class="flex-1 rounded-md bg-white/10 px-3 py-1.5 transition-colors hover:bg-white/20"
					>
						Cancel
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

{#if open}
	<!-- Click-away layer: dismiss the menu when the board behind it is clicked. -->
	<button
		type="button"
		aria-label="Close settings"
		tabindex="-1"
		class="fixed inset-0 z-40 cursor-default"
		on:click={close}
	></button>
{/if}
