<script lang="ts">
	import TerrainCanvas from '$lib/Dev/TerrainCanvas.svelte'
	import SheetStrip from '$lib/Dev/SheetStrip.svelte'
	import {
		PALETTE,
		SHAPES,
		cardinalCases,
		decode,
		encode,
		patch,
		pocketCases,
		strips,
		toPicture,
		type Case,
		type Patch,
	} from '$lib/Dev/shoreScenes'
	import { terrainData } from '$lib/GameData/terrain'
	import { onMount } from 'svelte'

	// --- shared view controls --------------------------------------------------
	let cell = $state(60)
	let grid = $state(false)
	let playing = $state(false)
	let frame = $state(0)

	$effect(() => {
		if (!playing) return
		const timer = setInterval(() => (frame += 1), 320)
		return () => clearInterval(timer)
	})

	// --- the paintable board ---------------------------------------------------
	const BLANK: Patch = patch([
		'..........',
		'..........',
		'..SSSSS...',
		'.SS~~~SS..',
		'.S~~~~~S..',
		'~~~~~~~~~~',
		'~~~~~~~~~~',
	])
	let board = $state<Patch>(BLANK)
	let brush = $state(PALETTE[4].type)

	onMount(() => {
		const shared = decode(decodeURIComponent(location.hash.slice(1)))
		if (shared) board = shared
	})

	const paint = (tile: number) => {
		if (board.tiles[tile] === brush) return
		const tiles = [...board.tiles]
		tiles[tile] = brush
		board = { ...board, tiles }
		history.replaceState(null, '', `#${encodeURIComponent(encode(board))}`)
	}

	const resize = (dc: number, dr: number) => {
		const cols = Math.max(3, Math.min(24, board.cols + dc))
		const rows = Math.max(3, Math.min(24, board.rows + dr))
		const picture = toPicture(board)
		board = patch(
			Array.from({ length: rows }, (_, r) =>
				Array.from({ length: cols }, (_, c) => picture[r]?.[c] ?? '~').join('')
			)
		)
	}

	let shareLink = $derived(`${'#'}${encodeURIComponent(encode(board))}`)
	let copied = $state(false)
	const copyBoard = async () => {
		await navigator.clipboard.writeText(toPicture(board).join('\n'))
		copied = true
		setTimeout(() => (copied = false), 1200)
	}

	// --- gallery controls ------------------------------------------------------
	const CORNER_PRESETS = [
		{ mask: 0b0000, label: 'all land' },
		{ mask: 0b1111, label: 'all water' },
		{ mask: 0b1010, label: 'TL + BR land' },
		{ mask: 0b0001, label: 'TL land only' },
	]
	let cornerMask = $state(0b1111)
	let diagonalWater = $state('~')
	let pocketWater = $state('~')
	let onlyMixed = $state(true)

	// The all-Shore neighbourhoods were never the broken ones — the interesting
	// cases are those where a side is open Sea, so they can be filtered to. The id
	// is the four cardinals, which is what that turns on; the diagonals are their
	// own control and would otherwise match everything.
	const mixed = (list: Case[]) => (onlyMixed ? list.filter((c) => c.id.includes('~')) : list)

	let cardinals = $derived(mixed(cardinalCases(cornerMask, diagonalWater)))
	let pockets = $derived(pocketCases(pocketWater))
	let coastStrips = strips()

	// --- sheet dump ------------------------------------------------------------
	const shore = terrainData.find((t) => t.name === 'Shore')!
	const COLUMN_GROUPS = [
		{ from: 0, to: 15, label: '0–15 border states' },
		{ from: 16, to: 19, label: '16–19 inner corners' },
		{ from: 20, to: 27, label: '20–27 edge caps' },
		{ from: 28, to: 39, label: '28–39 inner-corner caps (each corner: border A, B, both)' },
	]
	let sheetVariant = $state(0)
</script>

<svelte:head><title>ThunderLite — Shore</title></svelte:head>

<main class="min-h-screen bg-slate-900 p-4 pb-24 text-slate-100">
	<header class="mb-4 space-y-1">
		<a href="/dev" class="text-xs text-slate-400 hover:text-slate-200">← dev</a>
		<h1 class="text-2xl font-bold">Shore Combinations</h1>
		<p class="max-w-3xl text-sm leading-snug text-slate-400">
			Every coastline case the autotiler can produce, drawn through the real
			<code class="text-slate-300">spriteConnector</code> decisions and composited the way
			<code class="text-slate-300">paint.ts</code> does it. A coast breaks at a
			<em>border</em>, not on a tile, so each case is framed to put one border on screen with
			nothing else on it. Turn on the grid to see exactly where a line steps.
		</p>
	</header>

	<!-- view controls -->
	<div
		class="sticky top-0 z-10 mb-6 flex flex-wrap items-center gap-4 rounded-lg border border-slate-700 bg-slate-800/95 px-4 py-3 text-sm backdrop-blur"
	>
		<label class="flex items-center gap-2">
			<span class="text-slate-400">Zoom</span>
			<input type="range" min="30" max="180" step="15" bind:value={cell} class="w-32" />
			<span class="w-10 tabular-nums text-slate-300">{(cell / 60).toFixed(1)}×</span>
		</label>
		<label class="flex items-center gap-2">
			<input type="checkbox" bind:checked={grid} />
			<span class="text-slate-300">Tile borders</span>
		</label>
		<label class="flex items-center gap-2">
			<input type="checkbox" bind:checked={playing} />
			<span class="text-slate-300">Animate surf</span>
		</label>
		<span class="text-xs text-slate-500">frame {frame % 3}</span>
	</div>

	<!-- paintable board -->
	<section class="mb-10">
		<h2 class="mb-1 text-lg font-semibold">Playground</h2>
		<p class="mb-3 max-w-3xl text-sm text-slate-400">
			Paint a coast and watch it retile live. The board is kept in the URL, so anything that
			looks wrong can be sent back as a link — or copied as text with the button below.
		</p>
		<div class="flex flex-wrap items-start gap-4">
			<div class="flex flex-col gap-2">
				{#each PALETTE as entry}
					<button
						class="rounded border px-3 py-1.5 text-left text-sm {brush === entry.type
							? 'border-sky-400 bg-sky-500/20 text-sky-200'
							: 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500'}"
						onclick={() => (brush = entry.type)}
					>
						<span class="mr-2 font-mono text-xs text-slate-500">{entry.key}</span>{entry.label}
					</button>
				{/each}
			</div>
			<div class="rounded border border-slate-700 bg-slate-950 p-2">
				<TerrainCanvas patch={board} {cell} {frame} {grid} onTile={paint} />
			</div>
			<div class="flex w-52 flex-col gap-2 text-sm">
				<div class="flex gap-1">
					<button class="dev-btn" onclick={() => resize(-1, 0)}>−col</button>
					<button class="dev-btn" onclick={() => resize(1, 0)}>+col</button>
				</div>
				<div class="flex gap-1">
					<button class="dev-btn" onclick={() => resize(0, -1)}>−row</button>
					<button class="dev-btn" onclick={() => resize(0, 1)}>+row</button>
				</div>
				<button class="dev-btn" onclick={() => (board = BLANK)}>Reset</button>
				<button class="dev-btn" onclick={copyBoard}>{copied ? 'Copied' : 'Copy as text'}</button>
				<a class="dev-btn text-center" href={shareLink}>Link to this board</a>
				<pre
					class="overflow-x-auto rounded bg-slate-950 p-2 font-mono text-[11px] leading-tight text-slate-400">{toPicture(
						board
					).join('\n')}</pre>
			</div>
		</div>
	</section>

	<!-- realistic shapes -->
	<section class="mb-10">
		<h2 class="mb-1 text-lg font-semibold">Shapes a map actually makes</h2>
		<p class="mb-3 max-w-3xl text-sm text-slate-400">
			The layouts where several borders meet at once. If a coast reads as one line in all of
			these, the common cases are covered.
		</p>
		<div class="flex flex-wrap gap-4">
			{#each SHAPES as shape}
				<figure class="rounded border border-slate-700 bg-slate-950 p-2">
					<TerrainCanvas patch={shape.patch} {cell} {frame} {grid} />
					<figcaption class="mt-1 max-w-[20rem] text-xs text-slate-400">{shape.label}</figcaption>
				</figure>
			{/each}
		</div>
	</section>

	<!-- straight coasts -->
	<section class="mb-10">
		<h2 class="mb-1 text-lg font-semibold">Beach → sea handovers, all four facings</h2>
		<p class="mb-3 max-w-3xl text-sm text-slate-400">
			A straight coast with the water alternating between Shore and Sea, so every handover
			appears twice — once entering the beach, once leaving it. The four facings are separate
			art, so a fix that only lands on one of them shows up here.
		</p>
		<div class="flex flex-wrap items-start gap-4">
			{#each coastStrips as strip}
				<figure class="rounded border border-slate-700 bg-slate-950 p-2">
					<TerrainCanvas patch={strip.patch} {cell} {frame} {grid} />
					<figcaption class="mt-1 text-xs text-slate-400">{strip.label}</figcaption>
				</figure>
			{/each}
		</div>
	</section>

	<!-- inner-corner pockets -->
	<section class="mb-10">
		<h2 class="mb-1 text-lg font-semibold">Inner-corner pockets (16 cases)</h2>
		<p class="mb-3 max-w-3xl text-sm text-slate-400">
			A Shore tile with water on all four sides and land poking in diagonally. All of its sand
			comes from corner overlays rather than edge bands, which is the sand the end caps could
			not see for a long time. Switch the surrounding water to Shore to see what the same
			pocket looks like when it does not have to end.
		</p>
		<div class="mb-3 flex gap-2 text-sm">
			{#each [['~', 'surrounded by Sea'], ['S', 'surrounded by Shore']] as [key, label]}
				<button
					class="rounded border px-3 py-1 {pocketWater === key
						? 'border-sky-400 bg-sky-500/20 text-sky-200'
						: 'border-slate-700 bg-slate-800 text-slate-300'}"
					onclick={() => (pocketWater = key)}>{label}</button
				>
			{/each}
		</div>
		<div class="flex flex-wrap gap-3">
			{#each pockets as item}
				<figure class="rounded border border-slate-700 bg-slate-950 p-1.5">
					<TerrainCanvas patch={item.patch} {cell} {frame} {grid} />
					<figcaption class="mt-1 text-center text-[11px] text-slate-400">
						{item.label}
					</figcaption>
				</figure>
			{/each}
		</div>
	</section>

	<!-- full cardinal enumeration -->
	<section class="mb-10">
		<h2 class="mb-1 text-lg font-semibold">Every neighbourhood ({cardinals.length} cases)</h2>
		<p class="mb-3 max-w-3xl text-sm text-slate-400">
			A Shore tile with each of its four sides set to land, more beach, or open sea — the three
			answers that change how it is drawn, in every combination. The diagonals are a separate
			axis, since they only matter where both of their flanking sides are water. Each caption
			is the case's id: quote one back and I can reproduce it exactly.
		</p>
		<div class="mb-3 flex flex-wrap items-center gap-4 text-sm">
			<div class="flex items-center gap-2">
				<span class="text-slate-400">Diagonals</span>
				{#each CORNER_PRESETS as preset}
					<button
						class="rounded border px-2 py-1 text-xs {cornerMask === preset.mask
							? 'border-sky-400 bg-sky-500/20 text-sky-200'
							: 'border-slate-700 bg-slate-800 text-slate-300'}"
						onclick={() => (cornerMask = preset.mask)}>{preset.label}</button
					>
				{/each}
			</div>
			<div class="flex items-center gap-2">
				<span class="text-slate-400">Diagonal water is</span>
				{#each [['~', 'Sea'], ['S', 'Shore']] as [key, label]}
					<button
						class="rounded border px-2 py-1 text-xs {diagonalWater === key
							? 'border-sky-400 bg-sky-500/20 text-sky-200'
							: 'border-slate-700 bg-slate-800 text-slate-300'}"
						onclick={() => (diagonalWater = key)}>{label}</button
					>
				{/each}
			</div>
			<label class="flex items-center gap-2">
				<input type="checkbox" bind:checked={onlyMixed} />
				<span class="text-slate-300">Only cases touching Sea</span>
			</label>
		</div>
		<div class="flex flex-wrap gap-3">
			{#each cardinals as item (item.id)}
				<figure class="rounded border border-slate-700 bg-slate-950 p-1.5">
					<TerrainCanvas patch={item.patch} {cell} {frame} {grid} />
					<figcaption class="mt-1 text-center font-mono text-[11px] text-slate-500">
						{item.id}
					</figcaption>
				</figure>
			{/each}
		</div>
	</section>

	<!-- raw sheet -->
	<section>
		<h2 class="mb-1 text-lg font-semibold">The sheet itself</h2>
		<p class="mb-3 max-w-3xl text-sm text-slate-400">
			Every column of <code class="text-slate-300">shore.png</code>, one variant block at a time.
			Useful for telling a wrong <em>choice</em> of frame from a wrong <em>drawing</em> of one.
		</p>
		<label class="mb-3 flex w-fit items-center gap-2 text-sm">
			<span class="text-slate-400">Variant</span>
			<input
				type="range"
				min="0"
				max={(shore.variants ?? 1) - 1}
				bind:value={sheetVariant}
				class="w-40"
			/>
			<span class="tabular-nums text-slate-300">{sheetVariant}</span>
		</label>
		<div class="space-y-3">
			{#each COLUMN_GROUPS as group}
				<div>
					<div class="mb-1 text-xs uppercase tracking-wide text-slate-500">{group.label}</div>
					<div class="w-fit rounded border border-slate-700 bg-slate-950 p-1">
						<SheetStrip
							url={shore.url}
							from={group.from}
							to={group.to}
							row={sheetVariant * shore.frames + (frame % shore.frames)}
							{cell}
						/>
					</div>
				</div>
			{/each}
		</div>
	</section>
</main>

<style>
	.dev-btn {
		border-radius: 0.25rem;
		border: 1px solid rgb(51 65 85);
		background: rgb(30 41 59);
		padding: 0.25rem 0.75rem;
		color: rgb(203 213 225);
	}
	.dev-btn:hover {
		border-color: rgb(100 116 139);
		background: rgb(51 65 85);
	}
</style>
