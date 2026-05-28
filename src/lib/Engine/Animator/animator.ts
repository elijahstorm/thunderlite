import { get, writable } from 'svelte/store'
import { pathFinder } from '../Interactor/Pathing/pathFinder'
import { animationData } from '$lib/GameData/animation'
import { animationFrame } from '$lib/Sprites/animationFrameCount'
import { rendererStore } from '$lib/Sprites/spriteStore'
import { generateKey } from '$lib/Security/keys'

export const ANIMATION_TIME = 200

export const routeAnimation = writable<{
	map: MapObject
	unit: UnitObject
	route: ReturnType<typeof pathFinder>
} | null>(null)

export const animations = writable<
	{
		key: string
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

export const animateRoute = (
	map: MapObject,
	unit: UnitObject,
	start: number,
	destination: number,
	route: ReturnType<typeof pathFinder> = pathFinder(map, unit, start, destination)
) =>
	new Promise<void>((resolve) => {
		routeAnimation.set({ map, unit, route })
		setTimeout(
			() => {
				resolve()
				unit.state = getDirection(map, route, route.length - 1)
				routeAnimation.set(null)
			},
			(route.length - 1) * ANIMATION_TIME
		)
	})

export const startIncrementer: (increment: () => void, terminator: () => boolean) => void = (
	increment: () => void,
	terminator: () => boolean
) => {
	if (!terminator()) return
	setTimeout(() => {
		increment()
		setTimeout(() => {
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
		// The struck unit wheels around to face whoever hit it. It stays put while
		// the attacker swings, so its idle sprite simply renders in the new pose.
		const defender = map.layers.units[target]
		if (defender) defender.state = facingToward(map, target, source)
		const key = generateKey()
		const attackSprite = get(rendererStore).attacks[attacker.type]
		// Keep the attacker on the map (so it still grants fog-of-war sight) but
		// flag it so the canvas skips its idle sprite under the attack overlay.
		attacker.animating = true
		// The attack sprite is only loaded for unit types present when the board
		// mounts; a freshly-built type (or a headless/test context) may have none.
		// Skip the overlay but still resolve on the normal beat so the attack
		// commits and the turn keeps flowing — never throw out of an animation.
		if (!attackSprite) {
			setTimeout(() => {
				attacker.animating = false
				resolve()
			}, ANIMATION_TIME)
			return
		}
		animations.update((animations) => [
			...animations,
			{
				key,
				x: source % map.cols,
				y: Math.floor(source / map.cols),
				source: attackSprite.sprite[attacker.team ?? 0].src,
				xOffset: attackSprite.xOffset,
				yOffset: attackSprite.yOffset,
				frames: attackSprite.frames,
				state: attacker.state,
				width: 150,
				height: 150,
				states: 4,
				startingFrame: get(animationFrame),
			},
		])
		setTimeout(() => {
			attacker.animating = false
			removeAnimationByKey(key)
			resolve()
		}, ANIMATION_TIME * attackSprite.frames)
	})

export const animateExplosion = (map: MapObject, source: number) =>
	new Promise<void>((resolve) => {
		const explosion = animationData[0]
		const key = generateKey()
		animations.update((animations) => [
			...animations,
			{
				key,
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
				startingFrame: get(animationFrame),
			},
		])
		setTimeout(
			() => {
				removeAnimationByKey(key)
				resolve()
			},
			ANIMATION_TIME * (explosion.frames - 1)
		)
	})

const directions = [
	(map: MapObject, from: number, to: number) => from + 1 === to,
	(map: MapObject, from: number, to: number) => from + map.cols === to,
	(map: MapObject, from: number, to: number) => from - 1 === to,
	(map: MapObject, from: number, to: number) => from - map.cols === to,
]

const removeAnimationByKey = (key: string) =>
	animations.update((animations) => animations.filter((animation) => animation.key !== key))
