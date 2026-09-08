<script lang="ts">
	import { onMount } from 'svelte'
	import { browser } from '$app/environment'
	import { buildAsyncPreview, type AsyncPreviewSnapshot } from '$lib/Engine/asyncPreview'
	import { terrainData } from '$lib/GameData/terrain'
	import { teamColor } from '$lib/Engine/teamColors'

	interface Props {
		session: string
		yourTurn: boolean
	}

	let { session, yourTurn }: Props = $props()

	let canvas: HTMLCanvasElement | undefined = $state()
	let status: 'loading' | 'ready' | 'error' = $state('loading')

	const CELL = 6

	// A rough visual read, not the real sprite art — this only has to say "this
	// is roughly water / forest / mountain / road" at a glance, small enough
	// that loading full terrain sheets for every list item would be wasteful.
	const terrainColor = (type: number): string => {
		const t = terrainData[type]
		if (!t) return '#3a3a3a'
		if (t.ocean) return '#2f6fa8'
		switch (t.name) {
			case 'Mountain':
			case 'Volcano':
				return '#6b5c4d'
			case 'Forest':
			case 'Charred Forest':
				return '#2f5c34'
			case 'Road':
			case 'Bridge':
			case 'High Bridge':
				return '#8a8a86'
			default:
				return '#4c7a3f'
		}
	}

	const paint = (snapshot: AsyncPreviewSnapshot) => {
		if (!canvas) return
		canvas.width = snapshot.cols * CELL
		canvas.height = snapshot.rows * CELL
		const ctx = canvas.getContext('2d')
		if (!ctx) return
		for (let y = 0; y < snapshot.rows; y++) {
			for (let x = 0; x < snapshot.cols; x++) {
				const i = y * snapshot.cols + x
				ctx.fillStyle = terrainColor(snapshot.ground[i]?.type ?? 0)
				ctx.fillRect(x * CELL, y * CELL, CELL, CELL)

				const building = snapshot.buildings[i]
				if (building) {
					ctx.fillStyle = teamColor(building.team)
					ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2)
				}

				const unit = snapshot.units[i]
				if (unit && !unit.hidden) {
					ctx.fillStyle = teamColor(unit.team)
					ctx.beginPath()
					ctx.arc(x * CELL + CELL / 2, y * CELL + CELL / 2, CELL / 2.6, 0, Math.PI * 2)
					ctx.fill()
				}

				if (!snapshot.visible.has(i)) {
					ctx.fillStyle = 'rgba(0,0,0,0.45)'
					ctx.fillRect(x * CELL, y * CELL, CELL, CELL)
				}
			}
		}
	}

	onMount(() => {
		if (!browser) return
		let cancelled = false
		;(async () => {
			try {
				const res = await fetch(`/api/game/${session}/preview`)
				if (!res.ok) throw new Error('preview fetch failed')
				const { mapHash, actions, localTeam } = await res.json()
				const snapshot = await buildAsyncPreview(mapHash, actions, localTeam)
				if (cancelled) return
				paint(snapshot)
				status = 'ready'
			} catch {
				if (!cancelled) status = 'error'
			}
		})()
		return () => {
			cancelled = true
		}
	})
</script>

<div
	class="relative shrink-0 rounded-md border border-border bg-muted/40 overflow-hidden"
	style="width: 72px; height: 72px"
>
	<canvas
		bind:this={canvas}
		class="absolute inset-0 h-full w-full"
		style="image-rendering: pixelated"
	></canvas>
	{#if status !== 'ready'}
		<div class="absolute inset-0 flex items-center justify-center text-[9px] text-muted-foreground">
			{status === 'error' ? '—' : '…'}
		</div>
	{/if}
	{#if !yourTurn}
		<!-- Not your move: a static preview stays visible, just dimmed so the
		     your-turn games read as the ones that want attention. -->
		<div class="absolute inset-0 bg-black/40 pointer-events-none"></div>
	{/if}
</div>
