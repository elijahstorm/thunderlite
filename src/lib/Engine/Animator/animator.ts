import { get, writable } from 'svelte/store'
import { pathFinder } from '../Interactor/Pathing/pathFinder'
import { unitData } from '$lib/GameData/unit'
import { animationData } from '$lib/GameData/animation'
import { animationFrame } from '$lib/Sprites/animationFrameCount'

export const ANIMATION_TIME = 1000
export const ROUTE_SPEED = ANIMATION_TIME / 5

export const animateRoute = writable<{
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
		width: number
		height: number
		frames: number
		state: number
		states: number
		startingFrame: number
	}[]
>([])

export const animate = (
	map: MapObject,
	unit: UnitObject,
	start: number,
	destination: number,
	route: ReturnType<typeof pathFinder> = pathFinder(map, unit, start, destination)
) =>
	new Promise<void>((resolve) => {
		animateRoute.set({ map, unit, route })
		setTimeout(
			() => {
				resolve()
				unit.state = getDirection(map, route, route.length - 1)
				animateRoute.set(null)
			},
			((route.length - 1) * ANIMATION_TIME) / 5
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
		}, ANIMATION_TIME / 5)
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

export const animateAttack = (
	map: MapObject,
	attacker: UnitObject,
	source: number,
	target: number
) =>
	new Promise<void>((resolve) => {
		attacker.state = getDirection(
			map,
			[
				source,
				unitData[attacker.type].range[0] > 1
					? source % map.cols < target % map.cols
						? source + 1
						: source - 1
					: target,
			],
			0
		)
		const key = generateAnimationKey()
		const frames = 8
		animations.update((animations) => [
			...animations,
			{
				key,
				x: source % map.cols,
				y: Math.floor(source / map.cols),
				source: unitData[attacker.type].url.replace('idle', 'attack'),
				xOffset: 45,
				yOffset: 45,
				width: 150,
				height: 150,
				frames, // read from source data
				state: attacker.state,
				states: 4,
				startingFrame: get(animationFrame),
			},
		])
		setTimeout(() => removeAnimationByKey(key), ANIMATION_TIME * frames)
		resolve()
	})

export const animateExplosion = (map: MapObject, source: number) =>
	new Promise<void>((resolve) => {
		const explosion = animationData[0]
		const key = generateAnimationKey()
		animations.update((animations) => [
			...animations,
			{
				key,
				x: source % map.cols,
				y: Math.floor(source / map.cols),
				source: explosion.url,
				xOffset: explosion.xOffset,
				yOffset: explosion.yOffset,
				width: explosion.width,
				height: explosion.height,
				frames: explosion.frames,
				state: 0,
				states: 1,
				startingFrame: get(animationFrame),
			},
		])
		setTimeout(() => removeAnimationByKey(key), ANIMATION_TIME * (explosion.frames - 1))
		resolve()
	})

const directions = [
	(map: MapObject, from: number, to: number) => from + 1 === to,
	(map: MapObject, from: number, to: number) => from + map.cols === to,
	(map: MapObject, from: number, to: number) => from - 1 === to,
	(map: MapObject, from: number, to: number) => from - map.cols === to,
]

const generateAnimationKey = () => {
	const source = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
	return new Array(16)
		.fill('')
		.map(() => source[Math.floor(Math.random() * source.length)])
		.join()
}

const removeAnimationByKey = (key: string) =>
	animations.update((animations) => animations.filter((animation) => animation.key !== key))
