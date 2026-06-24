<script lang="ts">
	// DEV TOOL — see pathDebug.ts. Floating live readout of movement/path values
	// for the selected unit + hovered tile. Mounted only behind `dev`, so it never
	// ships to production. Toggle with the button or `P`; copy state with ⌘/Ctrl+C.
	import { pathDebug, pathDebugEnabled } from './pathDebug'
	import { get } from 'svelte/store'
	import { onDestroy, onMount } from 'svelte'
	import { browser } from '$app/environment'

	const toggle = () => pathDebugEnabled.update((v) => !v)

	let copied = false
	let copyTimer: ReturnType<typeof setTimeout> | undefined

	const copyState = async () => {
		const payload = JSON.stringify(get(pathDebug) ?? { note: 'no hover data yet' }, null, 2)
		try {
			await navigator.clipboard.writeText(payload)
		} catch {
			// Clipboard API can reject without a user gesture / over http — fall back.
			const ta = document.createElement('textarea')
			ta.value = payload
			document.body.appendChild(ta)
			ta.select()
			document.execCommand('copy')
			ta.remove()
		}
		copied = true
		clearTimeout(copyTimer)
		copyTimer = setTimeout(() => (copied = false), 1500)
	}

	const onKey = (e: KeyboardEvent) => {
		const el = e.target as HTMLElement | null
		const inField =
			!!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

		if ((e.key === 'p' || e.key === 'P') && !inField) {
			toggle()
			return
		}

		// While debug is on, Cmd/Ctrl+C copies the live state — but only when the
		// user isn't selecting real text (so normal copy still works) and isn't
		// typing in a field.
		if (
			get(pathDebugEnabled) &&
			(e.key === 'c' || e.key === 'C') &&
			(e.metaKey || e.ctrlKey) &&
			!inField &&
			!window.getSelection()?.toString()
		) {
			e.preventDefault()
			copyState()
		}
	}

	onMount(() => window.addEventListener('keydown', onKey))
	onDestroy(() => {
		// onDestroy also fires during SSR in Svelte 5, where `window` is undefined.
		if (browser) window.removeEventListener('keydown', onKey)
		clearTimeout(copyTimer)
	})

	$: info = $pathDebug
</script>

<div class="fixed top-2 right-2 z-[9999] font-mono text-[11px] leading-tight">
	<div class="flex items-center gap-1">
		<button class="rounded bg-black/80 px-2 py-1 text-white shadow" on:click={toggle}>
			path debug: {$pathDebugEnabled ? 'ON' : 'off'} (P)
		</button>
		{#if $pathDebugEnabled}
			<button
				class="rounded px-2 py-1 text-white shadow {copied ? 'bg-green-600' : 'bg-black/80'}"
				on:click={copyState}
			>
				{copied ? 'copied!' : 'copy (⌘C)'}
			</button>
		{/if}
	</div>

	{#if $pathDebugEnabled}
		<div class="mt-1 w-72 rounded bg-black/85 p-2 text-white shadow space-y-0.5">
			{#if !info}
				<div class="opacity-70">select a unit, then hover a tile…</div>
			{:else}
				<div>unit: <b>{info.unitType}</b> · move budget: <b>{info.movement}</b></div>
				<div>source tile: {info.source}</div>
				<hr class="my-1 border-white/20" />
				<div>hovered: {info.hovered} ({info.hoveredXY})</div>
				<div>terrain: {info.terrain} · enter cost: {info.enterDrag}</div>
				<div>
					green move tile:
					<b class={info.inMoveList ? 'text-green-400' : 'text-red-400'}>
						{info.inMoveList}
					</b>
					· in actions: {info.inActionsList}
				</div>
				<div>
					pathFinder:
					<b class={info.pathFound ? 'text-green-400' : 'text-red-400'}>
						{info.pathFound ? 'reachable' : 'NO PATH'}
					</b>
					· len {info.pathLen} · cost {info.pathCost}
				</div>
				{#if info.inMoveList && !info.pathFound}
					<div class="rounded bg-red-600/80 px-1 py-0.5">
						⚠ green but unroutable — arrow/click will fail here
					</div>
				{/if}
				<div class="opacity-70 break-all">path: [{info.path.join(', ')}]</div>
				<hr class="my-1 border-white/20" />
				<div class="font-semibold opacity-80">live route (what's drawn/clicked):</div>
				<div>
					arrow on hovered tile:
					<b class={info.hoveredHasArrow ? 'text-green-400' : 'text-red-400'}>
						{info.hoveredHasArrow}
					</b>
				</div>
				<div>
					history ends at hovered:
					<b class={info.pathHistoryEndsAtHovered ? 'text-green-400' : 'text-red-400'}>
						{info.pathHistoryEndsAtHovered}
					</b>
					· cost {info.pathHistoryCost}
				</div>
				<div class="opacity-70 break-all">history: [{info.pathHistory.join(', ')}]</div>
				<div class="opacity-70 break-all">arrows: [{info.arrowTiles.join(', ')}]</div>
				<hr class="my-1 border-white/20" />
				<div>move tiles: {info.moveListCount}</div>
				<div>
					desync (green, no path):
					<b class={info.desyncTiles.length ? 'text-red-400' : 'text-green-400'}>
						{info.desyncTiles.length}
					</b>
				</div>
				{#if info.desyncTiles.length}
					<div class="opacity-70 break-all">[{info.desyncTiles.join(', ')}]</div>
				{/if}
			{/if}
		</div>
	{/if}
</div>
