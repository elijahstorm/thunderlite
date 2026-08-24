<script lang="ts">
	import { goto } from '$app/navigation'
	import Icon from '@iconify/svelte'
	import { audioEngine } from '$lib/Audio/audioEngine'
	import { audioSettings } from '$lib/Stores/audioSettings'
	import { gameState } from '$lib/Engine/gameState'
	import { surrender } from '$lib/Engine/Interactor/interactor'
	import { shownThreatUnits, toggleAllThreats } from '$lib/Engine/threatOverlay'
	import { isDevMode, downloadDevLog, devLogSize } from '$lib/Engine/devLog'

	interface Props {
		map?: MapObject | undefined
		localTeam?: number
		menuHref?: string
	}

	let { map = undefined, localTeam = 0, menuHref = '/' }: Props = $props()

	let open = $state(false)
	let view: 'menu' | 'confirmGiveUp' | 'confirmExit' = $state('menu')

	let masterMuted = $derived($audioSettings.master.muted)
	let playing = $derived($gameState.phase === 'playing')
	let threatShown = $derived($shownThreatUnits.size > 0)

	// Music and SFX are independent channels — expose each so players can, say,
	// kill the soundtrack while keeping combat feedback. Master rides above both.
	const soundChannels = [
		{ key: 'music', label: 'Music', on: 'mdi:music-note', off: 'mdi:music-note-off' },
		{ key: 'sfx', label: 'Sound FX', on: 'mdi:volume-high', off: 'mdi:volume-off' },
		{
			key: 'env',
			label: 'Weather',
			on: 'mdi:weather-partly-rainy',
			off: 'mdi:weather-cloudy',
		},
	] as const

	const pct = (v: number) => `${Math.round(v * 100)}%`

	const toggleThreatOverlay = () => {
		if (map) toggleAllThreats(map)
	}

	const toggle = () => {
		open = !open
		view = 'menu'
	}
	const close = () => {
		open = false
		view = 'menu'
	}

	const toggleMasterMute = () => audioEngine.setMasterMute(!$audioSettings.master.muted)

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
		onclick={toggle}
		aria-label="Game settings"
		aria-expanded={open}
		class="pointer-events-auto rounded-lg border border-white/10 bg-neutral-900/85 p-2 text-white shadow-lg backdrop-blur-md transition-colors hover:bg-neutral-800/90"
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
					onclick={toggleMasterMute}
					class="flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors hover:bg-white/10"
				>
					<span class="flex items-center gap-2">
						<Icon
							icon={masterMuted ? 'mdi:volume-off' : 'mdi:volume-high'}
							width="18"
							height="18"
						/>
						Sound
					</span>
					<span class="text-xs text-white/60">{masterMuted ? 'Muted' : 'On'}</span>
				</button>

				{#each soundChannels as ch (ch.key)}
					{@const settings = $audioSettings[ch.key]}
					<div class="px-3 py-1.5" class:opacity-40={masterMuted}>
						<div class="flex items-center justify-between">
							<button
								type="button"
								onclick={() => audioEngine.toggleMute(ch.key)}
								aria-label={`${ch.label}: ${settings.muted ? 'unmute' : 'mute'}`}
								class="flex items-center gap-2 rounded-md text-left transition-colors hover:text-white/80"
							>
								<Icon icon={settings.muted ? ch.off : ch.on} width="18" height="18" />
								{ch.label}
							</button>
							<span class="text-xs text-white/60">
								{settings.muted ? 'Muted' : pct(settings.volume)}
							</span>
						</div>
						<input
							type="range"
							min="0"
							max="1"
							step="0.05"
							value={settings.volume}
							aria-label={`${ch.label} volume`}
							oninput={(e) => audioEngine.setChannelVolume(ch.key, e.currentTarget.valueAsNumber)}
							class="mt-1.5 h-1.5 w-full cursor-pointer accent-white"
						/>
					</div>
				{/each}

				<div class="my-1 h-px bg-white/10"></div>

				<button
					type="button"
					role="menuitem"
					onclick={toggleThreatOverlay}
					class="flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors hover:bg-white/10"
				>
					<span class="flex items-center gap-2">
						<Icon
							icon={threatShown ? 'mdi:eye-alert' : 'mdi:eye-off-outline'}
							width="18"
							height="18"
						/>
						Enemy range
					</span>
					<span class="text-xs text-white/60">{threatShown ? 'On (T)' : 'Off (T)'}</span>
				</button>

				<div class="my-1 h-px bg-white/10"></div>

				<button
					type="button"
					role="menuitem"
					disabled={!playing}
					onclick={() => (view = 'confirmGiveUp')}
					class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-red-300 transition-colors hover:bg-red-500/15 disabled:opacity-40 disabled:hover:bg-transparent"
				>
					<Icon icon="mdi:flag-variant" width="18" height="18" />
					Give up
				</button>
				<button
					type="button"
					role="menuitem"
					onclick={() => (view = 'confirmExit')}
					class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-white/10"
				>
					<Icon icon="mdi:exit-run" width="18" height="18" />
					Exit to menu
				</button>

				{#if isDevMode}
					<div class="my-1 h-px bg-white/10"></div>
					<p class="px-3 pt-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400/80">
						Dev (local only)
					</p>
					<button
						type="button"
						role="menuitem"
						onclick={downloadDevLog}
						class="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-white/10"
					>
						<span class="flex items-center gap-2">
							<Icon icon="mdi:download" width="18" height="18" />
							Download game log
						</span>
						<span class="text-xs text-white/60">{$devLogSize} acts</span>
					</button>
				{/if}
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
						onclick={view === 'confirmGiveUp' ? giveUp : exitToMenu}
						class="flex-1 rounded-md bg-red-600 px-3 py-1.5 font-medium transition-colors hover:bg-red-500"
					>
						{view === 'confirmGiveUp' ? 'Give up' : 'Exit'}
					</button>
					<button
						type="button"
						onclick={() => (view = 'menu')}
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
		onclick={close}
	></button>
{/if}
