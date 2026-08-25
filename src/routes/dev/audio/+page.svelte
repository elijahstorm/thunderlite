<script lang="ts">
	import { onMount } from 'svelte'
	import { ANIMATION_TIME } from '$lib/Engine/Animator/animator'
	import { audioEngine } from '$lib/Audio/audioEngine'
	import type { MusicBedStatus } from '$lib/Audio/musicBed'
	import { sfxManifest, envManifest } from '$lib/Audio/assetManifest'
	import { MusicClock } from '$lib/Audio/musicClock'
	import {
		MUSIC_PACKS,
		packLayers,
		phraseSecondsFor,
		phraseSecondsForLoop,
		type MusicPack,
	} from '$lib/Audio/musicPacks'
	import {
		FATIGUE_PHRASES,
		MOOD_SPECS,
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
	const PHRASES_PER_VARIATION = 2
	const MOOD_FADE_MS = 800
	const VARIATION_FADE_MS = 2500

	let pack = $state<MusicPack>(MUSIC_PACKS[0])
	let bedRunning = $state(false)
	let mood = $state<MusicMood>('player')
	let variation = $state(0)
	let dwell = $state(0)
	let seed = $state(1)
	let phrase = $state(0)
	/** Let the phrase clock drive variation, i.e. behave like a real match. */
	let auto = $state(true)
	let stems: ReadonlyMap<string, { currentGain: number; targetGain: number }> = $state(new Map())
	// Bed diagnostics. Layer drift is not measurable here because it is not
	// representable: every layer is one scheduled offset on a single audio clock.
	// What is worth watching is whether the bed got as far as being scheduled, and
	// the loop length it actually decoded (the registry figure is rounded).
	let bedStatus = $state<MusicBedStatus | null>(null)

	const layers = $derived(packLayers(pack))
	const gridPhraseSeconds = $derived(phraseSecondsForLoop(pack, bedStatus?.loopSeconds))
	const arrangement = $derived(arrangementFor(mood, variation, dwell, seed, pack.extras.length))
	const fatigueLevel = $derived(Math.floor(dwell / FATIGUE_PHRASES))

	const applyMix = (fadeMs: number) =>
		audioEngine.setMusicMix(mixForMood(mood, variation, dwell, seed, pack), { fadeMs })

	// Rebuilt per pack rather than reused: the phrase length is derived from the
	// pack's own loop, so a clock outliving a pack switch would tick off-grid.
	let clock: MusicClock | null = null

	const stopBed = () => {
		clock?.stop()
		clock = null
		audioEngine.stopMusicStems()
		bedRunning = false
		stems = new Map()
		bedStatus = null
	}

	const startBed = () => {
		stopBed()
		audioEngine.startMusicStems(layers)
		variation = 0
		dwell = 0
		phrase = 0
		clock = new MusicClock({
			phraseSeconds: () => phraseSecondsForLoop(pack, audioEngine.getMusicBedStatus()?.loopSeconds),
			position: () => audioEngine.getMusicPosition(),
			onPhrase: (p) => {
				phrase = p
				if (!auto) return
				dwell += 1
				variation = Math.floor(p / PHRASES_PER_VARIATION)
				applyMix(VARIATION_FADE_MS)
			},
		})
		clock.start()
		bedRunning = true
		applyMix(0)
	}

	// Packs run at different tempos and keys, so this is a hard cut, exactly as a
	// match boundary would be. There is no safe crossfade between two packs.
	const selectPack = (next: MusicPack) => {
		const wasRunning = bedRunning
		pack = next
		if (wasRunning) startBed()
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
			if (!bedRunning) return
			stems = audioEngine.getMusicStems()
			bedStatus = audioEngine.getMusicBedStatus()
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
			A pack is one composition delivered as independent stems, so any subset sums cleanly. A mood
			picks how many to raise; variation re-picks on phrase edges; fatigue thins a mood out the
			longer it overstays. A match holds one pack for its whole length, since packs differ in tempo
			and key. Leave it on Auto and just listen for a couple of minutes, which is the only way to
			judge whether it still wears out.
		</p>

		<div class="flex flex-wrap items-center gap-1.5">
			{#each MUSIC_PACKS as p}
				<button
					class="rounded px-2.5 py-1 text-xs {pack.id === p.id
						? 'bg-indigo-600'
						: 'bg-slate-700 hover:bg-slate-600'}"
					onclick={() => selectPack(p)}
				>
					{p.id}
					<span class="text-slate-400">
						{p.loopSeconds.toFixed(0)}s · {p.extras.length + 1}L
					</span>
					{#if p.devOnly}<span class="text-amber-400">dev</span>{/if}
				</button>
			{/each}
			<span class="text-xs text-slate-600">
				phrase {gridPhraseSeconds.toFixed(3)}s{bedStatus?.loopSeconds
					? ' (measured)'
					: ` (registry ${phraseSecondsFor(pack).toFixed(2)}s)`} · {pack.credit ?? 'uncredited'}
			</span>
		</div>

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
					<dt class="inline text-slate-500">bed</dt>
					<dd class="inline {bedStatus?.scheduled ? 'text-emerald-400' : 'text-amber-400'}">
						{bedStatus === null
							? 'off'
							: bedStatus.scheduled
								? 'locked'
								: bedStatus.ready
									? 'held'
									: 'loading'}
					</dd>
				</div>
				<div>
					<dt class="inline text-slate-500">ctx</dt>
					<dd class="inline">{bedStatus?.contextState ?? 'none'}</dd>
				</div>
				<div>
					<dt class="inline text-slate-500">loop</dt>
					<dd class="inline tabular-nums">
						{bedStatus?.loopSeconds ? `${bedStatus.loopSeconds.toFixed(3)}s` : '—'}
					</dd>
				</div>
				<div>
					<dt class="inline text-slate-500">pos</dt>
					<dd class="inline tabular-nums">
						{bedStatus?.position !== null && bedStatus?.position !== undefined
							? `${bedStatus.position.toFixed(2)}s`
							: '—'}
					</dd>
				</div>
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
					<dt class="inline text-slate-500">extras</dt>
					<dd class="inline tabular-nums">
						{arrangement.extras.length}/{pack.extras.length}
					</dd>
				</div>
				<div>
					<dt class="inline text-slate-500">foundation</dt>
					<dd class="inline">{arrangement.foundation ? 'up' : 'down'}</dd>
				</div>
				<div>
					<dt class="inline text-slate-500">level</dt>
					<dd class="inline tabular-nums">{Math.round(arrangement.level * 100)}%</dd>
				</div>
			</dl>

			<div class="grid max-w-2xl grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1">
				{#each layers as layer, i}
					{@const gain = stems.get(layer)?.currentGain ?? 0}
					{@const isFoundation = i === 0}
					<span class="text-xs {isFoundation ? 'text-slate-300' : 'text-slate-500'}">
						{layer.split('/').pop()}{isFoundation ? ' (foundation)' : ''}
					</span>
					<div class="h-2 overflow-clip rounded bg-slate-700">
						<div
							class="h-full {isFoundation ? 'bg-emerald-400' : 'bg-sky-400'}"
							style="width: {gain * 100}%"
						></div>
					</div>
					<span class="w-10 text-right text-xs tabular-nums text-slate-400">
						{Math.round(gain * 100)}%
					</span>
				{/each}
			</div>
			<p class="text-xs text-slate-600">
				Green is the foundation, up in every mood but silent. Blue are the freely combinable extras.
				If the demo pack reads 0% across the board, run scripts/audio/gen-demo-layers.sh.
			</p>
			<p class="text-xs text-slate-600">
				The bed reads <span class="text-amber-400">loading</span> while its layers decode,
				<span class="text-amber-400">held</span> if sound is off, and
				<span class="text-emerald-400">locked</span> once every layer is scheduled on one instant of the
				audio clock. Locked is permanent: the layers share a clock and a sample-exact loop, so no amount
				of elapsed time can separate them. Compare the measured loop against the registry figure the pack
				buttons show, since the phrase grid is derived from the measured one.
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
