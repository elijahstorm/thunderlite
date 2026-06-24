import { get } from 'svelte/store'
import { rendererStore } from '$lib/Sprites/spriteStore'
import { paint } from '$lib/Engine/paint'
import { connectionDecision, cornerDecision } from '$lib/Sprites/spriteConnector'

// Longest side of the generated thumbnail, and the per-tile size clamp that keeps
// small maps crisp and large maps from ballooning the PNG.
const TARGET_MAX_PX = 480
const MIN_CELL = 8
const MAX_CELL = 32

/**
 * Render the whole authored board to an offscreen canvas and return it as a PNG
 * data URL, suitable for uploading as a map thumbnail.
 *
 * Reuses the live game `paint` pipeline (terrain + coastlines + buildings +
 * units) against the sprites the editor has already loaded into `rendererStore`
 * — but paused on frame 0, with no fog, no HUD overlays, and no selection
 * markers (`editor` mode). Unlike the on-screen Scroller canvas, this paints
 * every tile, so the thumbnail shows the entire map rather than the scrolled
 * viewport.
 *
 * Returns null when sprites aren't ready yet or the canvas can't be exported, so
 * callers can fall back to publishing without a thumbnail rather than failing.
 */
export const renderMapThumbnail = (map: MapObject): string | null => {
	if (typeof document === 'undefined') return null

	const store = get(rendererStore)
	// Sprites decode asynchronously; bail if the ground atlas isn't ready yet.
	if (!store.ground[0]?.sprite) return null

	// Same thin accessor shape Game.svelte builds for the live board.
	const renderData: ObjectRenderer = {
		ground: (type: number) => store.ground[type],
		sky: (type?: number) => (typeof type !== 'undefined' ? (store.sky[type] ?? null) : null),
		unit: (type?: number) => (typeof type !== 'undefined' ? (store.units[type] ?? null) : null),
		building: (type?: number) =>
			typeof type !== 'undefined' ? (store.buildings[type] ?? null) : null,
		animation: (type: number) => store.animation[type] ?? null,
	}

	const cell = Math.max(
		MIN_CELL,
		Math.min(MAX_CELL, Math.floor(TARGET_MAX_PX / Math.max(map.cols, map.rows)))
	)

	const canvas = document.createElement('canvas')
	canvas.width = map.cols * cell
	canvas.height = map.rows * cell
	const context = canvas.getContext('2d')
	if (!context) return null
	// Pixel-art sprites: keep tile edges sharp at small sizes.
	context.imageSmoothingEnabled = false

	// Match what MapRender recomputes each frame so coastline/road connections and
	// inner corners draw correctly even if this runs before the live board paints.
	map.layers.ground.forEach((object, index) => {
		object.state = connectionDecision(object)(map, index)
		object.corners = cornerDecision(object)(map, index)
	})

	// paused=true → static frame 0; no fog; localTeam 0; editor=true → no idle
	// "selectable" markers. HUD images go unused: an authored map carries no
	// highlights/route, so the advice/route painters short-circuit before touching them.
	const tilePainter = paint(
		renderData,
		{} as HUDImages,
		true,
		() => null,
		0,
		true
	)(() => map)(context)

	for (let row = 0; row < map.rows; row++) {
		for (let col = 0; col < map.cols; col++) {
			tilePainter(row, col, col * cell, row * cell, cell, cell)
		}
	}

	try {
		return canvas.toDataURL('image/png')
	} catch {
		// Tainted canvas / export failure — publish without a thumbnail.
		return null
	}
}
