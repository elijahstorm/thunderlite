<script lang="ts">
	// Draws a patch of terrain the way the board does, so what shows up here is
	// what shows up in a match. The frame choice comes from the real
	// spriteConnector decisions and the compositing mirrors paint.ts: a base tile,
	// then each overlay copied quadrant-for-quadrant on top, with the Sea underlay
	// beneath anything transparent (reefs, bridge decks).
	//
	// It deliberately does NOT go through MapRender: that wants a whole match, and
	// half the point of this page is to put one border on screen with nothing else
	// on it.
	import { terrainData } from '$lib/GameData/terrain'
	import {
		connectionDecision,
		cornerDecision,
		seaUnderlayDecision,
		variantDecision,
	} from '$lib/Sprites/spriteConnector'
	import { cornerQuadrant, FIRST_CAP_STATE } from '$lib/Engine/paint'
	import { sheetImage, sheetsLoaded } from '$lib/Dev/devSheets.svelte'
	import type { Patch } from '$lib/Dev/shoreScenes'

	interface Props {
		patch: Patch
		/** Rendered size of one tile, in CSS px. */
		cell?: number
		frame?: number
		/** Draw a hairline on every tile border, to see exactly where a coast steps. */
		grid?: boolean
		onTile?: (tile: number) => void
	}

	let { patch, cell = 60, frame = 0, grid = false, onTile }: Props = $props()

	const SPRITE = 60
	const SEA = terrainData.find((t) => t.name === 'Sea')!

	let canvas = $state<HTMLCanvasElement>()

	// The decisions read a MapObject, so hand them one. Only `cols` and the ground
	// layer are ever touched by the coastline readers.
	let map = $derived({
		cols: patch.cols,
		rows: patch.rows,
		layers: {
			ground: patch.tiles.map((type) => ({ type, state: 0 })),
			sky: patch.tiles.map(() => null),
			units: patch.tiles.map(() => null),
			buildings: patch.tiles.map(() => null),
		},
	} as unknown as MapObject)

	const blit = (
		context: CanvasRenderingContext2D,
		url: string,
		x: number,
		y: number,
		state: number,
		row: number,
		quadrant?: [0 | 1, 0 | 1]
	) => {
		const image = sheetImage(url)
		if (!image) return
		if (!quadrant) {
			context.drawImage(image, state * SPRITE, row * SPRITE, SPRITE, SPRITE, x, y, cell, cell)
			return
		}
		const [qx, qy] = quadrant
		const half = SPRITE / 2
		context.drawImage(
			image,
			state * SPRITE + qx * half,
			row * SPRITE + qy * half,
			half,
			half,
			x + (qx * cell) / 2,
			y + (qy * cell) / 2,
			cell / 2,
			cell / 2
		)
	}

	// An inner corner redraws one quadrant of the tile; a beach cap reaches further
	// than a quadrant and is a whole cell, transparent wherever it should not paint.
	const overlay = (
		context: CanvasRenderingContext2D,
		url: string,
		x: number,
		y: number,
		corner: number,
		row: number
	) => {
		if (corner >= FIRST_CAP_STATE) return blit(context, url, x, y, corner, row)
		const quadrant = cornerQuadrant[corner]
		if (quadrant) blit(context, url, x, y, corner, row, quadrant)
	}

	$effect(() => {
		sheetsLoaded() // re-draw once a sheet has actually arrived
		const context = canvas?.getContext('2d')
		if (!context) return
		context.imageSmoothingEnabled = false
		context.clearRect(0, 0, patch.cols * cell, patch.rows * cell)

		for (let location = 0; location < patch.tiles.length; location += 1) {
			const object = map.layers.ground[location] as unknown as GroundObject
			const data = terrainData[object.type]
			const x = (location % patch.cols) * cell
			const y = Math.floor(location / patch.cols) * cell
			const row = variantDecision(object)(map, location) * data.frames + (frame % data.frames)

			// A reef or a bridge deck is cut out over transparent water, so the Sea
			// tile it would sit on goes down first — coastline and all.
			const underlay = seaUnderlayDecision(object)(map, location)
			if (underlay) {
				const seaRow = frame % SEA.frames
				blit(context, SEA.url, x, y, underlay.state, seaRow)
				for (const corner of underlay.corners) overlay(context, SEA.url, x, y, corner, seaRow)
			}

			blit(context, data.url, x, y, connectionDecision(object)(map, location), row)
			for (const corner of cornerDecision(object)(map, location))
				overlay(context, data.url, x, y, corner, row)
		}

		if (grid) {
			context.strokeStyle = 'rgba(255,0,255,0.55)'
			context.lineWidth = 1
			for (let c = 1; c < patch.cols; c += 1) {
				context.beginPath()
				context.moveTo(c * cell + 0.5, 0)
				context.lineTo(c * cell + 0.5, patch.rows * cell)
				context.stroke()
			}
			for (let r = 1; r < patch.rows; r += 1) {
				context.beginPath()
				context.moveTo(0, r * cell + 0.5)
				context.lineTo(patch.cols * cell, r * cell + 0.5)
				context.stroke()
			}
		}
	})

	const hit = (event: MouseEvent) => {
		if (!onTile || !canvas) return
		const box = canvas.getBoundingClientRect()
		const col = Math.floor(((event.clientX - box.left) / box.width) * patch.cols)
		const row = Math.floor(((event.clientY - box.top) / box.height) * patch.rows)
		if (col < 0 || row < 0 || col >= patch.cols || row >= patch.rows) return
		onTile(row * patch.cols + col)
	}
</script>

<canvas
	bind:this={canvas}
	width={patch.cols * cell}
	height={patch.rows * cell}
	style="image-rendering: pixelated;"
	class={onTile ? 'cursor-crosshair' : ''}
	onmousedown={hit}
	onmousemove={(event) => event.buttons === 1 && hit(event)}
></canvas>
