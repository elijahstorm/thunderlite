import { derived, get, writable } from 'svelte/store'
import { pathFinder } from '../Interactor/Pathing/pathFinder'
import { animationData, ANIMATION_EXPLOSION } from '$lib/GameData/animation'
import { animationFrame, overlayFrame } from '$lib/Sprites/animationFrameCount'
import { rendererStore } from '$lib/Sprites/spriteStore'
import { clearMaterialize } from '$lib/Engine/materialize'
import { clearBuildFade } from '$lib/Engine/buildFade'
import { generateKey } from '$lib/Security/keys'

export const ANIMATION_TIME = 200

// Health bars don't snap to their new value after a hit — they glide there with an
// ease-out so a chunk of damage (or a heal) reads as motion. ~400ms is long enough
// to register the slide without holding up the next combat beat.
export const HEALTH_BAR_ANIMATION_TIME = 400

// Grace on top of the ease before the wall-clock backstop finishes it by hand
// (see `animateHealthBar`). Generous enough that a visible tab always lands the
// real animation first, short enough that a hidden one isn't held up long.
export const HEALTH_BAR_BACKSTOP_SLACK = 600

// Per-frame playback for combat overlays (attack swings, explosions). These
// sprite sheets run 8-14 frames; at the 200ms movement beat they dragged on for
// 1.6-2.8s and read as unnaturally slow. ~55ms (~18fps) keeps them punchy while
// still showing every frame. Tuned independently of movement/idle pacing.
export const OVERLAY_ANIMATION_TIME = 55

// Every animation beat is driven by a setTimeout. When the board is torn down
// mid-animation (e.g. a dev playground switches map types while a unit is
// walking) the component tree is rebuilt, but these timers and the global stores
// survive — a stale `routeAnimation` flies a ghost of the old scene's unit
// across the new map, and a pending `set(null)` can later blank a fresh move.
// Track every timer through `schedule` so `clearAnimations` can cancel them all
// and reset the stores to idle when the map data is swapped out.
const pendingTimers = new Set<ReturnType<typeof setTimeout>>()

const schedule = (callback: () => void, ms: number) => {
	const id = setTimeout(() => {
		pendingTimers.delete(id)
		callback()
	}, ms)
	pendingTimers.add(id)
	return id
}

// Health-bar eases run off requestAnimationFrame for a smooth slide rather than the
// coarse 200ms paint tick. Track every frame request (and the units being eased) so
// `clearAnimations` can cancel them and drop any half-applied `displayHealth` when
// the board is torn down mid-combat.
const pendingFrames = new Set<number>()
const easingUnits = new Set<UnitObject>()

// Bumped on every health-bar frame so the canvas (which only repaints on store
// changes or the slow idle tick) redraws each step of the slide. MapRender folds
// this into its render-trigger block.
export const repaintSignal = writable(0)

// Count of in-flight multi-beat animations that don't continuously occupy
// `animations`/`routeAnimation` — the attack sequence (which has quiet gaps
// between strike, health-bar ease, and counter) and standalone health eases. The
// auto-end-turn watcher treats a non-zero count as "still animating", so it can't
// fire in the gap between a player's final strike and the enemy's counter and slam
// the turn-transition overlay over a still-playing animation.
export const animationBusy = writable(0)
export const beginAnimationBeat = () => animationBusy.update((n) => n + 1)
export const endAnimationBeat = () => animationBusy.update((n) => Math.max(0, n - 1))

export const routeAnimation = writable<{
	map: MapObject
	unit: UnitObject
	route: ReturnType<typeof pathFinder>
} | null>(null)

export const animations = writable<
	{
		key: string
		tile: number
		x: number
		y: number
		source: string
		xOffset: number
		yOffset: number
		frames: number
		state: number
		width: number
		height: number
		states: number
		startingFrame: number
	}[]
>([])

// True whenever the board is mid-animation: a unit walking its route, combat
// overlays on screen, or a multi-beat attack/health-bar ease in flight. Player
// input gating (clicks, hover marker, route preview) reads this so nothing can
// select or move a unit until the previous action's animations have settled.
export const boardBusy = derived(
	[routeAnimation, animations, animationBusy],
	([$routeAnimation, $animations, $animationBusy]) =>
		$routeAnimation !== null || $animations.length > 0 || $animationBusy > 0
)

// Cancel any in-flight animation timers and reset both overlay stores to idle.
// Call this when the board's map data is swapped (dev scene switches, resets) so
// a unit mid-walk on the previous map can't leak a ghost overlay onto the new one.
export const clearAnimations = () => {
	for (const id of pendingTimers) clearTimeout(id)
	pendingTimers.clear()
	if (typeof cancelAnimationFrame !== 'undefined') {
		for (const id of pendingFrames) cancelAnimationFrame(id)
	}
	pendingFrames.clear()
	for (const unit of easingUnits) unit.displayHealth = undefined
	easingUnits.clear()
	animationBusy.set(0)
	routeAnimation.set(null)
	animations.set([])
	clearMaterialize()
	clearBuildFade()
}

// --- Camera follow -----------------------------------------------------------
// The main board registers a camera so a route animation can keep the moving unit
// in view: it centres on *another* player's unit as its slide opens (so an AI or
// online opponent's move cuts to the action), then trails the unit tile-by-tile
// once it nears the viewport edge. Minimaps and the map editor never register, so
// at most one camera is live; it's null under tests/headless (no-op).
export type RouteCamera = {
	// Committed scroll target (content px), viewport size, and the tile size — or
	// null while the board isn't mounted.
	view: () => {
		left: number
		top: number
		width: number
		height: number
		tileWidth: number
		tileHeight: number
	} | null
	// Scroll to a content-px position; returns the clamped target actually applied.
	panTo: (left: number, top: number, animate: boolean) => { left: number; top: number } | null
	// Can the local viewer currently see `unit` on `tile`? (fog + stealth)
	sees: (tile: number, unit: UnitObject, map: MapObject) => boolean
	// Is `unit` controlled by the local viewer? (skip the auto-centre for own units)
	owns: (unit: UnitObject) => boolean
}

let routeCamera: RouteCamera | null = null
export const setRouteCamera = (camera: RouteCamera) => {
	routeCamera = camera
}
// Only clear if the caller is still the registered camera, so a torn-down board
// can't wipe a fresh board's registration during a hand-off.
export const clearRouteCamera = (camera: RouteCamera) => {
	if (routeCamera === camera) routeCamera = null
}

/**
 * Centre the main board on a tile. Same camera the route follow drives, exposed
 * so UI outside the board tree can steer it — the HUD's overview map uses this
 * for click-to-jump. Returns false when no board is mounted (tests, menus).
 */
export const panBoardToTile = (x: number, y: number, animate = true): boolean => {
	const camera = routeCamera
	if (!camera) return false
	const view = camera.view()
	if (!view) return false
	camera.panTo(
		(x + 0.5) * view.tileWidth - view.width / 2,
		(y + 0.5) * view.tileHeight - view.height / 2,
		animate
	)
	return true
}

// How close (in tiles) the moving unit may get to a viewport edge before the
// camera trails it — one tile per movement beat, matching the slide. Turning away
// from an edge stops the pan on that axis until the unit heads back toward it, so a
// zig-zag path doesn't jitter the view.
const CAMERA_EDGE_PADDING_TILES = 2

const followRouteWithCamera = (map: MapObject, unit: UnitObject, route: number[]) => {
	const camera = routeCamera
	if (!camera || route.length === 0) return
	const cols = map.cols

	// Where we intend the view to sit. Tracked ourselves (seeded from the live
	// scroll, or the centred position below) so each beat computes from where the
	// camera is heading rather than a mid-slide interpolation.
	let target: { left: number; top: number } | null = null

	// Centre another player's unit as its move opens — but only when we can see
	// where it starts, so a fog- or stealth-hidden mover is never revealed.
	if (!camera.owns(unit) && camera.sees(route[0], unit, map)) {
		const view = camera.view()
		if (view) {
			const x = route[0] % cols
			const y = Math.floor(route[0] / cols)
			const left = (x + 0.5) * view.tileWidth - view.width / 2
			const top = (y + 0.5) * view.tileHeight - view.height / 2
			target = camera.panTo(left, top, true)
		}
	}

	const stepTo = (step: number) => {
		const view = camera.view()
		if (!view) return
		// Don't chase a unit we can't see this beat (an enemy slipping back into fog).
		if (!camera.sees(route[step], unit, map)) return
		if (target === null) target = { left: view.left, top: view.top }

		const tile = route[step]
		const prev = route[step - 1]
		const nx = tile % cols
		const ny = Math.floor(tile / cols)
		const dx = nx - (prev % cols)
		const dy = ny - Math.floor(prev / cols)
		const ux = (nx + 0.5) * view.tileWidth
		const uy = (ny + 0.5) * view.tileHeight
		const padX = CAMERA_EDGE_PADDING_TILES * view.tileWidth
		const padY = CAMERA_EDGE_PADDING_TILES * view.tileHeight

		let left = target.left
		let top = target.top
		// Only push toward an edge while the unit is on-screen on that axis: a move
		// the viewer scrolled away from is never yanked into frame, and a change of
		// direction simply stops the push until the unit heads that way again.
		const onScreenX = ux >= target.left && ux <= target.left + view.width
		const onScreenY = uy >= target.top && uy <= target.top + view.height
		if (onScreenX) {
			if (dx > 0 && ux > target.left + view.width - padX) left = ux - (view.width - padX)
			else if (dx < 0 && ux < target.left + padX) left = ux - padX
		}
		if (onScreenY) {
			if (dy > 0 && uy > target.top + view.height - padY) top = uy - (view.height - padY)
			else if (dy < 0 && uy < target.top + padY) top = uy - padY
		}
		if (left !== target.left || top !== target.top) {
			target = camera.panTo(left, top, true) ?? { left, top }
		}
	}

	// Trail the slide beat-for-beat. Step `n` registers on the board at
	// `(n - 1) * ANIMATION_TIME` (see startIncrementer), so fire the pan then. These
	// timers ride the same `schedule` as the slide, so `clearAnimations` cancels
	// them if the board is torn down mid-move.
	for (let step = 1; step < route.length; step++) {
		schedule(() => stepTo(step), (step - 1) * ANIMATION_TIME)
	}
}

export const animateRoute = (
	map: MapObject,
	unit: UnitObject,
	start: number,
	destination: number,
	route: ReturnType<typeof pathFinder> = pathFinder(map, unit, start, destination)
) =>
	new Promise<void>((resolve) => {
		routeAnimation.set({ map, unit, route })
		followRouteWithCamera(map, unit, route)
		schedule(
			() => {
				unit.state = getDirection(map, route, route.length - 1)
				// Resolve before clearing the overlay so the caller's .then() runs
				// applyMove (placing the unit at the destination tile) while the
				// route overlay is still mounted. Then defer the clear to the next
				// macrotask — after the .then() microtask has committed the move —
				// so the canvas has the idle unit to draw at the destination
				// before the DOM overlay is unmounted. Otherwise the
				// synchronous reactive render on `routeAnimation = null` paints
				// the destination tile blank between "overlay cleared" and
				// "applyMove committed", and the unit flashes invisible.
				resolve()
				schedule(() => routeAnimation.set(null), 0)
			},
			(route.length - 1) * ANIMATION_TIME
		)
	})

export const startIncrementer: (increment: () => void, terminator: () => boolean) => void = (
	increment: () => void,
	terminator: () => boolean
) => {
	if (!terminator()) return
	schedule(() => {
		increment()
		schedule(() => {
			startIncrementer(increment, terminator)
		}, ANIMATION_TIME)
	}, 0)
}

export const getDirection = (map: MapObject, route: number[], index: number) => {
	if (!route.length) return 0

	if (index + 1 >= route.length) {
		return directions.findIndex((validator) =>
			validator(map, route[route.length - 2], route[route.length - 1])
		)
	}

	return directions.findIndex((validator) => validator(map, route[index], route[index + 1]))
}

// Turns a unit on `from` to look toward `to`. Adjacent (melee) pairings use the
// exact orthogonal pose; distant (ranged) pairings glance left/right toward the
// opponent's column, since the sprite sheets only pose in the 4 cardinals.
export const facingToward = (map: MapObject, from: number, to: number): number => {
	const orthogonal = directions.findIndex((validator) => validator(map, from, to))
	if (orthogonal >= 0) return orthogonal
	// Distant (ranged) pairings only pose in the 4 cardinals, so snap to the
	// dominant axis. When there's a horizontal offset, glance left/right toward
	// the opponent's column; when perfectly aligned vertically, face up/down.
	const dx = (to % map.cols) - (from % map.cols)
	if (dx !== 0) return dx > 0 ? 0 : 2
	return to > from ? 1 : 3
}

export const animateAttack = (
	map: MapObject,
	attacker: UnitObject,
	source: number,
	target: number
) =>
	new Promise<void>((resolve) => {
		attacker.state = facingToward(map, source, target)
		// The struck unit does NOT wheel to face here: it keeps its current pose
		// while the attacker swings. It only turns toward its foe when (and if) it
		// gets to return fire — the combat sequencer drives that as a separate beat
		// by calling this same helper with the defender as the attacker.
		const key = generateKey()
		const attackSprite = get(rendererStore).attacks[attacker.type]
		// The renderer is created synchronously but its `sprite` array is filled in
		// asynchronously once the image decodes. If either the renderer is missing
		// (headless/test context) or the sprite hasn't loaded yet, skip the overlay
		// but resolve on the normal beat so combat keeps flowing. Crucially, don't
		// flip `animating` here — that flag hides the idle in favor of the overlay,
		// and without an overlay the attacker would briefly vanish.
		const readySprite = attackSprite?.sprite?.[attacker.team ?? 0]
		if (!readySprite) {
			schedule(resolve, ANIMATION_TIME)
			return
		}
		// Keep the attacker on the map (so it still grants fog-of-war sight) but
		// flag it so the canvas skips its idle sprite under the attack overlay.
		attacker.animating = true
		animations.update((animations) => [
			...animations,
			{
				key,
				tile: source,
				x: source % map.cols,
				y: Math.floor(source / map.cols),
				source: readySprite.src,
				xOffset: attackSprite.xOffset,
				yOffset: attackSprite.yOffset,
				frames: attackSprite.frames,
				state: attacker.state,
				width: 150,
				height: 150,
				states: 4,
				startingFrame: get(overlayFrame),
			},
		])
		schedule(() => {
			attacker.animating = false
			removeAnimationByKey(key)
			resolve()
		}, OVERLAY_ANIMATION_TIME * attackSprite.frames)
	})

// Plays a one-shot tile overlay (an entry in `animationData`) on `source`, running
// through its frames once at the overlay clock and resolving when the last frame
// has shown. The shared backbone for the death blast and every secondary-hit
// effect (splash flame/shrapnel, lance pierce, scorched forest) — all single-column
// sheets seated on the tile the same way.
export const animateTileEffect = (map: MapObject, source: number, animationIndex: number) =>
	new Promise<void>((resolve) => {
		const effect = animationData[animationIndex]
		if (!effect) {
			resolve()
			return
		}
		const key = generateKey()
		animations.update((animations) => [
			...animations,
			{
				key,
				tile: source,
				x: source % map.cols,
				y: Math.floor(source / map.cols),
				source: effect.url,
				xOffset: effect.xOffset,
				yOffset: effect.yOffset,
				frames: effect.frames,
				state: 0,
				width: effect.width,
				height: effect.height,
				states: 1,
				startingFrame: get(overlayFrame),
			},
		])
		schedule(
			() => {
				removeAnimationByKey(key)
				resolve()
			},
			OVERLAY_ANIMATION_TIME * (effect.frames - 1)
		)
	})

export const animateExplosion = (map: MapObject, source: number) =>
	animateTileEffect(map, source, ANIMATION_EXPLOSION)

// Glide a unit's health bar from `from` to `to` with an ease-out, driving a canvas
// repaint each frame. Used for both damage and healing. The eased value lives on
// `unit.displayHealth` (paint prefers it over the real `health`).
//
// `hold` controls what happens at the end:
//   - false (default): clear `displayHealth` so the bar settles on the real
//     `health`. Correct when the real health was *already* committed before the
//     ease started (e.g. repair), so clearing is seamless.
//   - true: leave `displayHealth` parked at `to`. Correct when the real `health`
//     is committed *after* the ease (the attack sequence), so clearing here would
//     briefly expose the stale pre-combat health and snap the bar back up. The
//     caller reconciles (clears `displayHealth`) once it commits.
//
// Resolves immediately (snapping to `to`) when there's no animation frame clock —
// headless / test runs.
export const animateHealthBar = (unit: UnitObject, from: number, to: number, hold = false) =>
	new Promise<void>((resolve) => {
		if (
			from === to ||
			typeof requestAnimationFrame === 'undefined' ||
			typeof performance === 'undefined'
		) {
			unit.displayHealth = hold ? to : undefined
			resolve()
			return
		}

		unit.displayHealth = from
		easingUnits.add(unit)
		beginAnimationBeat()
		const start = performance.now()
		let frameId = 0
		let settled = false
		// requestAnimationFrame is not merely throttled in a hidden tab, it is
		// suspended outright — so an ease that starts (or gets interrupted) while the
		// tab is in the background never advances and never resolves, stranding
		// whoever awaited it. For the attack sequence that means the commit inside it
		// never runs; when the attack belongs to a CPU side this client is driving for
		// an online room, the whole match hangs on that turn for every other player.
		// setTimeout is only throttled, never suspended, so it can always finish the
		// ease. It is deliberately NOT registered with `schedule`: this timer's job is
		// to settle a promise, and `clearAnimations` cancelling it would reintroduce
		// exactly the hang it exists to prevent.
		const settle = () => {
			if (settled) return
			settled = true
			clearTimeout(backstop)
			// A teardown mid-ease (`clearAnimations`) already reset this unit; don't
			// paint a stale value back onto a board that has moved on.
			if (easingUnits.has(unit)) {
				unit.displayHealth = hold ? to : undefined
				easingUnits.delete(unit)
				repaintSignal.update((n) => n + 1)
			}
			endAnimationBeat()
			resolve()
		}
		const requestStep = () => {
			frameId = requestAnimationFrame(step)
			pendingFrames.add(frameId)
		}
		const step = (now: number) => {
			pendingFrames.delete(frameId)
			if (settled) return
			const t = Math.min(1, (now - start) / HEALTH_BAR_ANIMATION_TIME)
			// easeOutCubic — fast departure, gentle landing.
			const eased = 1 - Math.pow(1 - t, 3)
			unit.displayHealth = from + (to - from) * eased
			repaintSignal.update((n) => n + 1)
			if (t < 1) {
				requestStep()
			} else {
				settle()
			}
		}
		const backstop = setTimeout(settle, HEALTH_BAR_ANIMATION_TIME + HEALTH_BAR_BACKSTOP_SLACK)
		requestStep()
	})

const directions = [
	(map: MapObject, from: number, to: number) => from + 1 === to,
	(map: MapObject, from: number, to: number) => from + map.cols === to,
	(map: MapObject, from: number, to: number) => from - 1 === to,
	(map: MapObject, from: number, to: number) => from - map.cols === to,
]

const removeAnimationByKey = (key: string) =>
	animations.update((animations) => animations.filter((animation) => animation.key !== key))
