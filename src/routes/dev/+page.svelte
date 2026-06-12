<script lang="ts">
	import { onMount } from 'svelte'
	import { ANIMATION_TIME } from '$lib/Engine/Animator/animator'
	import { unitData } from '$lib/GameData/unit'
	import { animationData, ANIMATION_EXPLOSION } from '$lib/GameData/animation'
	import { createImageLoader } from '$lib/Sprites/images'
	import { imageColorizer } from '$lib/Sprites/imageColorizer'
	import { audioEngine } from '$lib/Audio/audioEngine'
	import { sfxManifest, envManifest } from '$lib/Audio/assetManifest'
	import { MUSIC_STEMS } from '$lib/Audio/musicDirector'
	import { sfxForAction } from '$lib/Audio/sfxMap'
	import { audioSettings } from '$lib/Stores/audioSettings'

	// ── Animation clock — same beat the in-game renderer ticks on ─────────────
	let frame = 0

	// ── Sprite loading: the exact loader + team colorizer the game uses ───────
	let makeImage: ReturnType<typeof createImageLoader> | null = null
	let colorize: ReturnType<typeof imageColorizer> | null = null
	const spriteCache = new Map<string, string>()
	let cacheVersion = 0

	const ensureSprite = (url: string, team: number) => {
		const key = `${url}|${team}`
		if (!makeImage || spriteCache.has(key)) return
		spriteCache.set(key, '')
		makeImage(url)((image) => {
			const colored = colorize ? colorize(team)(image) : image
			spriteCache.set(key, colored.src)
			cacheVersion += 1
		})
	}

	const spriteSrc = (url: string, team: number, _version: number): string | null =>
		spriteCache.get(`${url}|${team}`) || null

	// ── Unit viewer state ──────────────────────────────────────────────────────
	const teams = ['Red', 'Blue', 'Green', 'Yellow', 'Grey']
	const directions = ['→', '↓', '←', '↑', 'Pose 5', 'Pose 6']
	let team = 0
	let direction = 1 // facing down

	$: if (makeImage) {
		team
		for (const unit of unitData) {
			ensureSprite(unit.url, team)
			if (unit.attackSprite) ensureSprite(unit.attackSprite.url, team)
		}
		for (const fx of animationData) ensureSprite(fx.url, 0)
	}

	const explosion = animationData[ANIMATION_EXPLOSION]
	let attacking: Record<number, { start: number } | undefined> = {}
	let exploding: Record<number, { start: number } | undefined> = {}

	const playAttack = (index: number) => {
		const sprite = unitData[index].attackSprite
		if (!sprite || attacking[index]) return
		const sfx = sfxForAction('attack', { type: index })
		if (sfx) audioEngine.playSfx(sfx)
		attacking[index] = { start: frame }
		setTimeout(() => (attacking[index] = undefined), ANIMATION_TIME * sprite.frames)
	}

	const playDeath = (index: number) => {
		if (exploding[index]) return
		audioEngine.playSfx('explosion')
		exploding[index] = { start: frame }
		setTimeout(() => (exploding[index] = undefined), ANIMATION_TIME * (explosion.frames - 1))
	}

	const playMoveSfx = (index: number) => {
		const sfx = sfxForAction('move', { type: index })
		if (sfx) audioEngine.playSfx(sfx)
	}

	type PreviewSprite = {
		source: string
		frames: number
		states: number
		state: number
		xOffset: number
		yOffset: number
		width?: number
		height?: number
	}

	// Mirror of Animator.svelte's `render` math at cell size 60 / scale 1, with
	// the sprite anchored to a single tile at the origin — what you see here is
	// exactly what the game draws.
	const renderStyle = (sprite: PreviewSprite, frame: number) => {
		const width = sprite.width ?? 60 + sprite.xOffset
		const height = sprite.height ?? 60 + sprite.yOffset
		return `
			left: ${-sprite.xOffset}px;
			top: ${-sprite.yOffset}px;
			width: ${width}px;
			height: ${height}px;
			background-image: url('${sprite.source}');
			background-position: ${-sprite.state * width}px ${(-frame % sprite.frames) * height}px;
			background-size: ${width * sprite.states}px ${height * sprite.frames}px;
		`
	}

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
		colorize = imageColorizer()
		makeImage = createImageLoader(() => {})
		const timer = setInterval(() => {
			frame += 1
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
	<title>ThunderLite — Dev Playground</title>
</svelte:head>

<main class="min-h-screen space-y-12 bg-slate-900 p-6 text-slate-100">
	<header class="space-y-1">
		<h1 class="text-2xl font-bold">Dev Playground</h1>
		<p class="text-sm text-slate-400">
			Animations and sounds, straight from the real engine code. Dev server only. If nothing sounds,
			click anywhere first — browsers require a user gesture before audio plays.
		</p>
	</header>

	<!-- ── Units ─────────────────────────────────────────────────────────── -->
	<section class="space-y-4">
		<h2 class="text-xl font-semibold">Units</h2>

		<div class="flex flex-wrap items-center gap-6 text-sm">
			<div class="flex items-center gap-2">
				<span class="text-slate-400">Team</span>
				{#each teams as name, i}
					<button
						class="rounded px-2 py-1 {team === i
							? 'bg-slate-200 text-slate-900'
							: 'bg-slate-700 hover:bg-slate-600'}"
						on:click={() => (team = i)}
					>
						{name}
					</button>
				{/each}
			</div>
			<div class="flex items-center gap-2">
				<span class="text-slate-400">Facing</span>
				{#each directions as label, i}
					<button
						class="rounded px-2 py-1 {direction === i
							? 'bg-slate-200 text-slate-900'
							: 'bg-slate-700 hover:bg-slate-600'}"
						on:click={() => (direction = i)}
					>
						{label}
					</button>
				{/each}
			</div>
		</div>

		<div class="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-4">
			{#each unitData as unit, i}
				{@const idleSrc = spriteSrc(unit.url, team, cacheVersion)}
				{@const attackSrc = unit.attackSprite
					? spriteSrc(unit.attackSprite.url, team, cacheVersion)
					: null}
				{@const explosionSrc = spriteSrc(explosion.url, 0, cacheVersion)}
				<div class="space-y-2 rounded border border-slate-700 bg-slate-800 p-3 text-center">
					<div class="relative mx-auto h-[60px] w-[60px] rounded bg-slate-700/60">
						{#if attacking[i] && attackSrc && unit.attackSprite}
							<div
								class="absolute"
								style={renderStyle(
									{
										source: attackSrc,
										frames: unit.attackSprite.frames,
										states: 4,
										state: Math.min(direction, 3),
										xOffset: unit.attackSprite.xOffset,
										yOffset: unit.attackSprite.yOffset,
										width: 150,
										height: 150,
									},
									frame - (attacking[i]?.start ?? 0)
								)}
							></div>
						{:else if idleSrc}
							<div
								class="absolute"
								style={renderStyle(
									{
										source: idleSrc,
										frames: unit.frames,
										states: 6,
										state: direction,
										xOffset: unit.xOffset,
										yOffset: unit.yOffset,
									},
									frame
								)}
							></div>
						{:else}
							<div class="pt-5 text-xs text-slate-500">loading…</div>
						{/if}
						{#if exploding[i] && explosionSrc}
							<div
								class="absolute"
								style={renderStyle(
									{
										source: explosionSrc,
										frames: explosion.frames,
										states: 1,
										state: 0,
										xOffset: explosion.xOffset,
										yOffset: explosion.yOffset,
										width: explosion.width,
										height: explosion.height,
									},
									frame - (exploding[i]?.start ?? 0)
								)}
							></div>
						{/if}
					</div>
					<p class="truncate text-sm font-medium" title={unit.name}>{unit.name}</p>
					<div class="flex justify-center gap-1 text-xs">
						<button
							class="rounded bg-slate-700 px-2 py-1 hover:bg-slate-600 disabled:opacity-40"
							disabled={!unit.attackSprite}
							on:click={() => playAttack(i)}
						>
							Attack
						</button>
						<button
							class="rounded bg-slate-700 px-2 py-1 hover:bg-slate-600 disabled:opacity-40"
							disabled={sfxForAction('move', { type: i }) === null}
							on:click={() => playMoveSfx(i)}
						>
							Move sfx
						</button>
						<button
							class="rounded bg-slate-700 px-2 py-1 hover:bg-slate-600"
							on:click={() => playDeath(i)}
						>
							Die
						</button>
					</div>
				</div>
			{/each}
		</div>
	</section>

	<!-- ── Tile FX ───────────────────────────────────────────────────────── -->
	<section class="space-y-4">
		<h2 class="text-xl font-semibold">Tile FX</h2>
		<div class="flex flex-wrap gap-4">
			{#each animationData as fx}
				{@const src = spriteSrc(fx.url, 0, cacheVersion)}
				<div class="space-y-2 rounded border border-slate-700 bg-slate-800 p-3 text-center">
					<div class="relative mx-auto h-[60px] w-[60px] rounded bg-slate-700/60">
						{#if src}
							<div
								class="absolute"
								style={renderStyle(
									{
										source: src,
										frames: fx.frames,
										states: 1,
										state: 0,
										xOffset: fx.xOffset,
										yOffset: fx.yOffset,
										width: fx.width,
										height: fx.height,
									},
									frame
								)}
							></div>
						{/if}
					</div>
					<p class="text-sm">{fx.name}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- ── Sound board ───────────────────────────────────────────────────── -->
	<section class="space-y-6">
		<h2 class="text-xl font-semibold">Sounds</h2>

		<div class="space-y-2">
			<h3 class="font-medium text-slate-300">Channel mixer</h3>
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
		</div>

		<div class="space-y-2">
			<h3 class="font-medium text-slate-300">Sound effects</h3>
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
		</div>

		<div class="space-y-2">
			<h3 class="font-medium text-slate-300">Music stems (adaptive layer)</h3>
			<p class="text-xs text-slate-500">
				Stems start together in lockstep and crossfade — solo one to hear the transition the way
				turn changes sound in a match.
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
		</div>

		<div class="space-y-2">
			<h3 class="font-medium text-slate-300">Stings &amp; themes</h3>
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
		</div>

		<div class="space-y-2">
			<h3 class="font-medium text-slate-300">Weather ambience</h3>
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
		</div>
	</section>
</main>
