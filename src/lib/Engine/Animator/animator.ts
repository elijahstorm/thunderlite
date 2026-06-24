import { get, writable } from 'svelte/store'
import { pathFinder } from '../Interactor/Pathing/pathFinder'
import { animationData, ANIMATION_EXPLOSION } from '$lib/GameData/animation'
import { animationFrame, overlayFrame } from '$lib/Sprites/animationFrameCount'
import { rendererStore } from '$lib/Sprites/spriteStore'
import { generateKey } from '$lib/Security/keys'

export const ANIMATION_TIME = 200

// Health bars don't snap to their new value after a hit — they glide there with an
// ease-out so a chunk of damage (or a heal) reads as motion. ~400ms is long enough
// to register the slide without holding up the next combat beat.
export const HEALTH_BAR_ANIMATION_TIME = 400

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
		schedule(
			() => {
				unit.state = getDirection(map, route, route.length - 1)
				// Resolve before clearing the overlay so the caller's .then() runs
				// applyMove (placing the unit at the destination tile) while the
				// route overlay is still mounted. Then defer the clear to the next
				// macrotask — after the .then() microtask has committed the move —
				// so the canvas has the idle unit to draw at the destination
				// before the DOM overlay's out:fly fades it away. Otherwise the
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
	return from % map.cols < to % map.cols ? 0 : 2
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

export const animateExplosion = (map: MapObject, source: number) =>
	new Promise<void>((resolve) => {
		const explosion = animationData[ANIMATION_EXPLOSION]
		const key = generateKey()
		animations.update((animations) => [
			...animations,
			{
				key,
				tile: source,
				x: source % map.cols,
				y: Math.floor(source / map.cols),
				source: explosion.url,
				xOffset: explosion.xOffset,
				yOffset: explosion.yOffset,
				frames: explosion.frames,
				state: 0,
				width: explosion.width,
				height: explosion.height,
				states: 1,
				startingFrame: get(overlayFrame),
			},
		])
		schedule(
			() => {
				removeAnimationByKey(key)
				resolve()
			},
			OVERLAY_ANIMATION_TIME * (explosion.frames - 1)
		)
	})

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
		const requestStep = () => {
			frameId = requestAnimationFrame(step)
			pendingFrames.add(frameId)
		}
		const step = (now: number) => {
			pendingFrames.delete(frameId)
			const t = Math.min(1, (now - start) / HEALTH_BAR_ANIMATION_TIME)
			// easeOutCubic — fast departure, gentle landing.
			const eased = 1 - Math.pow(1 - t, 3)
			unit.displayHealth = from + (to - from) * eased
			repaintSignal.update((n) => n + 1)
			if (t < 1) {
				requestStep()
			} else {
				unit.displayHealth = hold ? to : undefined
				easingUnits.delete(unit)
				repaintSignal.update((n) => n + 1)
				endAnimationBeat()
				resolve()
			}
		}
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
