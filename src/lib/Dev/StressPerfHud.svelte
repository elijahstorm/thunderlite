<script lang="ts">
	import { onDestroy, onMount } from 'svelte'
	import type { StressStats } from '$lib/Dev/stressMap'

	// Live main-thread health readout for the stress playground. A requestAnimation
	// Frame loop is the honest instrument here: the browser only serves the next
	// frame once our synchronous work (the per-frame terrain sweep, fog/threat
	// recompute, a CPU turn, canvas paint) has cleared the main thread, so the gap
	// between frames IS the jank. We report a rolling FPS, the worst frame in the
	// window (the stutter you actually feel), and a count of dropped frames.
	export let stats: StressStats

	let fps = 0
	let worstMs = 0
	let jankFrames = 0
	let running = true

	// A "long" frame — anything past ~two 60fps frames is a visible hitch.
	const LONG_FRAME_MS = 32

	let raf = 0
	let last = 0
	let frames = 0
	let windowStart = 0
	let windowWorst = 0

	const loop = (now: number) => {
		if (!running) return
		if (last) {
			const dt = now - last
			frames += 1
			if (dt > windowWorst) windowWorst = dt
			if (dt > LONG_FRAME_MS) jankFrames += 1
		}
		last = now
		// Recompute the rolling window ~4x/sec so the numbers are readable, not a blur.
		if (now - windowStart >= 250) {
			fps = Math.round((frames * 1000) / (now - windowStart))
			worstMs = Math.round(windowWorst)
			frames = 0
			windowWorst = 0
			windowStart = now
		}
		raf = requestAnimationFrame(loop)
	}

	const resetJank = () => {
		jankFrames = 0
	}

	onMount(() => {
		windowStart = performance.now()
		raf = requestAnimationFrame(loop)
	})
	onDestroy(() => {
		running = false
		if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(raf)
	})

	// Green while smooth, amber as it strains, red once it's clearly dropping frames.
	$: fpsColor = fps >= 50 ? 'text-emerald-400' : fps >= 30 ? 'text-amber-400' : 'text-rose-400'
	$: worstColor =
		worstMs <= 20 ? 'text-emerald-400' : worstMs <= 50 ? 'text-amber-400' : 'text-rose-400'
</script>

<div class="pointer-events-auto space-y-2 rounded-lg border border-slate-700 bg-slate-950/80 p-3 font-mono text-xs backdrop-blur">
	<div class="flex items-baseline justify-between gap-6">
		<span class="text-slate-400">FPS</span>
		<span class="text-lg font-bold tabular-nums {fpsColor}">{fps}</span>
	</div>
	<div class="flex items-baseline justify-between gap-6">
		<span class="text-slate-400">worst frame</span>
		<span class="tabular-nums {worstColor}">{worstMs}ms</span>
	</div>
	<div class="flex items-baseline justify-between gap-6">
		<span class="text-slate-400">dropped (&gt;{LONG_FRAME_MS}ms)</span>
		<span class="tabular-nums text-slate-200"
			>{jankFrames}
			<button class="ml-1 rounded bg-slate-800 px-1 text-slate-400 hover:text-slate-100" on:click={resetJank}>↺</button
			></span
		>
	</div>

	<hr class="border-slate-800" />

	<div class="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-300">
		<span class="text-slate-500">tiles</span>
		<span class="text-right tabular-nums">{stats.tiles.toLocaleString()}</span>
		<span class="text-slate-500">units</span>
		<span class="text-right tabular-nums">{stats.units.toLocaleString()}</span>
		<span class="text-slate-500">buildings</span>
		<span class="text-right tabular-nums">{stats.buildings.toLocaleString()}</span>
		<span class="text-slate-500">teams</span>
		<span class="text-right tabular-nums">{stats.teams}</span>
		<span class="text-slate-500">build time</span>
		<span class="text-right tabular-nums">{Math.round(stats.buildMs)}ms</span>
	</div>
</div>
