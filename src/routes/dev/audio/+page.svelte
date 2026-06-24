<script lang="ts">
	import { onMount } from 'svelte'
	import { ANIMATION_TIME } from '$lib/Engine/Animator/animator'
	import { audioEngine } from '$lib/Audio/audioEngine'
	import { sfxManifest, envManifest } from '$lib/Audio/assetManifest'
	import { MUSIC_STEMS } from '$lib/Audio/musicDirector'
	import { audioSettings } from '$lib/Stores/audioSettings'

	// ── Sound board state ──────────────────────────────────────────────────────
	const channels = ['master', 'music', 'sfx', 'env'] as const
	type Channel = (typeof channels)[number]

	const setVolume = (channel: Channel, volume: number) =>
		channel === 'master'
			? audioEngine.setMasterVolume(volume)
			: audioEngine.setChannelVolume(channel, volume)

	const toggleMute = (channel: Channel) =>
		channel === 'master'
			? audioEngine.setMasterMute(!$audioSettings.master.muted)
			: audioEngine.toggleMute(channel)

	const sfxNames = Object.keys(sfxManifest)
	const envNames = Object.keys(envManifest)
	const stings: { name: string; loop: boolean }[] = [
		{ name: 'game/win', loop: false },
		{ name: 'game/lose', loop: false },
		{ name: 'intro-theme', loop: true },
	]

	let stemsRunning = false
	let fadeMs = 800
	let stems: ReadonlyMap<string, { currentGain: number; targetGain: number }> = new Map()

	const startStems = () => {
		audioEngine.startMusicStems(MUSIC_STEMS)
		stemsRunning = true
	}
	const stopStems = () => {
		audioEngine.stopMusicStems()
		stemsRunning = false
		stems = new Map()
	}
	const soloStem = (name: string) => audioEngine.setMusicMix({ [name]: 1 }, { fadeMs })

	onMount(() => {
		const timer = setInterval(() => {
			if (stemsRunning) stems = audioEngine.getMusicStems()
		}, ANIMATION_TIME)
		return () => {
			clearInterval(timer)
			stopStems()
			audioEngine.stopMusic()
			audioEngine.stopEnv()
		}
	})
</script>

<svelte:head>
	<title>ThunderLite — Audio Board</title>
</svelte:head>

<main class="min-h-screen space-y-6 bg-slate-900 p-6 text-slate-100">
	<header class="space-y-1">
		<a href="/dev" class="text-xs text-slate-400 hover:text-slate-200">← dev</a>
		<h1 class="text-2xl font-bold">Audio Board</h1>
		<p class="text-sm text-slate-400">
			Channels, SFX, adaptive music stems and weather ambience, straight from the real audio engine.
			If nothing sounds, click anywhere first — browsers require a user gesture before audio plays.
		</p>
	</header>

	<section class="space-y-2">
		<h2 class="font-medium text-slate-300">Channel mixer</h2>
		<div class="grid max-w-2xl grid-cols-[auto_1fr_auto_auto] items-center gap-x-4 gap-y-2">
			{#each channels as channel}
				<span class="text-sm capitalize text-slate-400">{channel}</span>
				<input
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={$audioSettings[channel].volume}
					on:input={(e) => setVolume(channel, parseFloat(e.currentTarget.value))}
				/>
				<span class="w-10 text-right text-xs tabular-nums text-slate-400">
					{Math.round($audioSettings[channel].volume * 100)}%
				</span>
				<button
					class="rounded px-2 py-1 text-xs {$audioSettings[channel].muted
						? 'bg-red-500/80'
						: 'bg-slate-700 hover:bg-slate-600'}"
					on:click={() => toggleMute(channel)}
				>
					{$audioSettings[channel].muted ? 'Unmute' : 'Mute'}
				</button>
			{/each}
		</div>
	</section>

	<section class="space-y-2">
		<h2 class="font-medium text-slate-300">Sound effects</h2>
		<div class="flex flex-wrap gap-2">
			{#each sfxNames as name}
				<button
					class="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600"
					on:click={() => audioEngine.playSfx(name)}
				>
					{name}
				</button>
			{/each}
		</div>
	</section>

	<section class="space-y-2">
		<h2 class="font-medium text-slate-300">Music stems (adaptive layer)</h2>
		<p class="text-xs text-slate-500">
			Stems start together in lockstep and crossfade — solo one to hear the transition the way turn
			changes sound in a match.
		</p>
		<div class="flex flex-wrap items-center gap-2">
			{#if !stemsRunning}
				<button
					class="rounded bg-emerald-600 px-3 py-1.5 text-sm hover:bg-emerald-500"
					on:click={startStems}
				>
					Start stems
				</button>
			{:else}
				<button
					class="rounded bg-red-600 px-3 py-1.5 text-sm hover:bg-red-500"
					on:click={stopStems}
				>
					Stop stems
				</button>
				<button
					class="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600"
					on:click={() => audioEngine.setMusicMix({}, { fadeMs })}
				>
					Silence all
				</button>
				<label class="flex items-center gap-2 text-xs text-slate-400">
					Fade
					<input type="range" min="0" max="3000" step="100" bind:value={fadeMs} />
					{fadeMs}ms
				</label>
			{/if}
		</div>
		{#if stemsRunning}
			<div class="grid max-w-2xl grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1">
				{#each MUSIC_STEMS as stem}
					{@const gain = stems.get(stem)?.currentGain ?? 0}
					<button
						class="rounded bg-slate-700 px-2 py-1 text-left text-xs hover:bg-slate-600"
						on:click={() => soloStem(stem)}
					>
						{stem}
					</button>
					<div class="h-2 overflow-clip rounded bg-slate-700">
						<div class="h-full bg-emerald-400" style="width: {gain * 100}%"></div>
					</div>
					<span class="w-10 text-right text-xs tabular-nums text-slate-400">
						{Math.round(gain * 100)}%
					</span>
				{/each}
			</div>
		{/if}
	</section>

	<section class="space-y-2">
		<h2 class="font-medium text-slate-300">Stings &amp; themes</h2>
		<div class="flex flex-wrap gap-2">
			{#each stings as sting}
				<button
					class="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600"
					on:click={() => audioEngine.playMusic(sting.name, { loop: sting.loop })}
				>
					{sting.name}{sting.loop ? ' (loop)' : ''}
				</button>
			{/each}
			<button
				class="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600"
				on:click={() => audioEngine.stopMusic()}
			>
				Stop music
			</button>
		</div>
	</section>

	<section class="space-y-2">
		<h2 class="font-medium text-slate-300">Weather ambience</h2>
		<div class="flex flex-wrap gap-2">
			{#each envNames as name}
				<button
					class="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600"
					on:click={() => audioEngine.playEnv(name)}
				>
					{name}
				</button>
			{/each}
			<button
				class="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600"
				on:click={() => audioEngine.stopEnv()}
			>
				Stop env
			</button>
		</div>
	</section>
</main>
