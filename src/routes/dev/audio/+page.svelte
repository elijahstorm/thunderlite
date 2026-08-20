<script lang="ts">
	import { onMount } from 'svelte'
	import { ANIMATION_TIME } from '$lib/Engine/Animator/animator'
	import { audioEngine } from '$lib/Audio/audioEngine'
	import { sfxManifest, envManifest } from '$lib/Audio/assetManifest'
	import { MUSIC_STEMS } from '$lib/Audio/musicDirector'
	import { MusicClock } from '$lib/Audio/musicClock'
	import {
		FATIGUE_PHRASES,
		MOOD_SPECS,
		MUSIC_STACK,
		arrangementFor,
		mixForMood,
		type MusicMood,
	} from '$lib/Audio/musicVariation'
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

	// ── Adaptive bed ───────────────────────────────────────────────────────────
	// Mirrors what MusicDirector does in a real match, but with the game state
	// swapped for buttons, so a mood or a fatigue level can be held still and
	// listened to instead of arriving on its own schedule.
	const moods = Object.keys(MOOD_SPECS) as MusicMood[]
	const PHRASE_SECONDS = 8
	const PHRASES_PER_VARIATION = 2
	const MOOD_FADE_MS = 800
	const VARIATION_FADE_MS = 2500

	let bedRunning = $state(false)
	let mood = $state<MusicMood>('player')
	let variation = $state(0)
	let dwell = $state(0)
	let seed = $state(1)
	let phrase = $state(0)
	/** Let the phrase clock drive variation, i.e. behave like a real match. */
	let auto = $state(true)
	let stems: ReadonlyMap<string, { currentGain: number; targetGain: number }> = $state(new Map())

	const arrangement = $derived(arrangementFor(mood, variation, dwell, seed))
	const fatigueLevel = $derived(Math.floor(dwell / FATIGUE_PHRASES))

	const applyMix = (fadeMs: number) =>
		audioEngine.setMusicMix(mixForMood(mood, variation, dwell, seed), { fadeMs })

	// Constructed eagerly — it starts no timer until `start()`, so this is safe
	// during SSR.
	const clock = new MusicClock({
		phraseSeconds: PHRASE_SECONDS,
		position: () => audioEngine.getMusicPosition(),
		onPhrase: (p) => {
			phrase = p
			if (!auto) return
			dwell += 1
			variation = Math.floor(p / PHRASES_PER_VARIATION)
			applyMix(VARIATION_FADE_MS)
		},
	})

	const startBed = () => {
		audioEngine.startMusicStems(MUSIC_STEMS)
		bedRunning = true
		variation = 0
		dwell = 0
		phrase = 0
		clock.reset()
		clock.start()
		applyMix(0)
	}
	const stopBed = () => {
		clock.stop()
		audioEngine.stopMusicStems()
		bedRunning = false
		stems = new Map()
	}

	// A mood change resets fatigue, exactly as the director does — which is what
	// makes a returning mood come back at full strength.
	const setMood = (next: MusicMood) => {
		mood = next
		dwell = 0
		applyMix(MOOD_FADE_MS)
	}
	const stepVariation = () => {
		variation += 1
		applyMix(VARIATION_FADE_MS)
	}
	const stepFatigue = () => {
		dwell += FATIGUE_PHRASES
		applyMix(VARIATION_FADE_MS)
	}
	const reseed = () => {
		seed += 1
		applyMix(VARIATION_FADE_MS)
	}

	onMount(() => {
		const timer = setInterval(() => {
			if (bedRunning) stems = audioEngine.getMusicStems()
		}, ANIMATION_TIME)
		return () => {
			clearInterval(timer)
			stopBed()
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
					oninput={(e) => setVolume(channel, parseFloat(e.currentTarget.value))}
				/>
				<span class="w-10 text-right text-xs tabular-nums text-slate-400">
					{Math.round($audioSettings[channel].volume * 100)}%
				</span>
				<button
					class="rounded px-2 py-1 text-xs {$audioSettings[channel].muted
						? 'bg-red-500/80'
						: 'bg-slate-700 hover:bg-slate-600'}"
					onclick={() => toggleMute(channel)}
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
					onclick={() => audioEngine.playSfx(name)}
				>
					{name}
				</button>
			{/each}
		</div>
	</section>

	<section class="space-y-3">
		<h2 class="font-medium text-slate-300">Adaptive bed</h2>
		<p class="text-xs text-slate-500">
			Every layer loops in lockstep and is only ever mixed by gain. A mood picks how deep into the
			stack to go; variation re-arranges within the mood on phrase edges; fatigue thins a mood out
			the longer it overstays. Leave it on Auto and just listen for a couple of minutes, which is
			the only way to judge whether it still wears out.
		</p>

		<div class="flex flex-wrap items-center gap-2">
			{#if !bedRunning}
				<button
					class="rounded bg-emerald-600 px-3 py-1.5 text-sm hover:bg-emerald-500"
					onclick={startBed}
				>
					Start bed
				</button>
			{:else}
				<button class="rounded bg-red-600 px-3 py-1.5 text-sm hover:bg-red-500" onclick={stopBed}>
					Stop bed
				</button>
				<label class="flex items-center gap-2 text-xs text-slate-400">
					<input type="checkbox" bind:checked={auto} />
					Auto (clock drives variation)
				</label>
				<button
					class="rounded bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600"
					onclick={stepVariation}
				>
					Next variation
				</button>
				<button
					class="rounded bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600"
					onclick={stepFatigue}
				>
					+1 fatigue step
				</button>
				<button class="rounded bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600" onclick={reseed}>
					Reseed ({seed})
				</button>
			{/if}
		</div>

		{#if bedRunning}
			<div class="flex flex-wrap gap-1.5">
				{#each moods as name}
					<button
						class="rounded px-2.5 py-1 text-xs {mood === name
							? 'bg-emerald-600'
							: 'bg-slate-700 hover:bg-slate-600'}"
						onclick={() => setMood(name)}
					>
						{name}
					</button>
				{/each}
			</div>

			<dl class="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400">
				<div>
					<dt class="inline text-slate-500">phrase</dt>
					<dd class="inline tabular-nums">{phrase}</dd>
				</div>
				<div>
					<dt class="inline text-slate-500">variation</dt>
					<dd class="inline tabular-nums">{variation}</dd>
				</div>
				<div>
					<dt class="inline text-slate-500">dwell</dt>
					<dd class="inline tabular-nums">{dwell}</dd>
				</div>
				<div>
					<dt class="inline text-slate-500">fatigue</dt>
					<dd class="inline tabular-nums {fatigueLevel > 0 ? 'text-amber-400' : ''}">
						{fatigueLevel}
					</dd>
				</div>
				<div>
					<dt class="inline text-slate-500">intensity</dt>
					<dd class="inline tabular-nums">{arrangement.intensity}/{MUSIC_STACK.length}</dd>
				</div>
				<div>
					<dt class="inline text-slate-500">color</dt>
					<dd class="inline">{arrangement.color.length ? arrangement.color.join(', ') : 'none'}</dd>
				</div>
				<div>
					<dt class="inline text-slate-500">level</dt>
					<dd class="inline tabular-nums">{Math.round(arrangement.level * 100)}%</dd>
				</div>
			</dl>

			<div class="grid max-w-2xl grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1">
				{#each MUSIC_STEMS as stem, i}
					{@const gain = stems.get(stem)?.currentGain ?? 0}
					{@const isStack = i < MUSIC_STACK.length}
					<span class="text-xs {isStack ? 'text-slate-300' : 'text-slate-500 italic'}">
						{stem.replace('layers/', '')}
					</span>
					<div class="h-2 overflow-clip rounded bg-slate-700">
						<div
							class="h-full {isStack ? 'bg-emerald-400' : 'bg-sky-400'}"
							style="width: {gain * 100}%"
						></div>
					</div>
					<span class="w-10 text-right text-xs tabular-nums text-slate-400">
						{Math.round(gain * 100)}%
					</span>
				{/each}
			</div>
			<p class="text-xs text-slate-600">
				Green is the cumulative stack (an intensity of N raises the first N). Blue is color, toggled
				for variety only. Run scripts/audio/gen-demo-layers.sh if these all read 0%.
			</p>
		{/if}
	</section>

	<section class="space-y-2">
		<h2 class="font-medium text-slate-300">Stings &amp; themes</h2>
		<div class="flex flex-wrap gap-2">
			{#each stings as sting}
				<button
					class="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600"
					onclick={() => audioEngine.playMusic(sting.name, { loop: sting.loop })}
				>
					{sting.name}{sting.loop ? ' (loop)' : ''}
				</button>
			{/each}
			<button
				class="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600"
				onclick={() => audioEngine.stopMusic()}
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
					onclick={() => audioEngine.playEnv(name)}
				>
					{name}
				</button>
			{/each}
			<button
				class="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600"
				onclick={() => audioEngine.stopEnv()}
			>
				Stop env
			</button>
		</div>
	</section>
</main>
