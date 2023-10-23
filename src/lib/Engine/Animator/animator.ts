import { writable } from 'svelte/store'
import { pathFinder } from '../Interactor/Pathing/pathFinder'
import { unitData } from '$lib/GameData/unit'

export const animateRoute = writable<{
	map: MapObject
	unit: UnitObject
	route: ReturnType<typeof pathFinder>
} | null>(null)

export const animations = writable<
	{
		x: number
		y: number
		src: string
		xOffset: number
		yOffset: number
		frames: number
		state: number
	}[]
>([])

export const ANIMATION_TIME = 1600 // 200

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

const directions = [
	(map: MapObject, from: number, to: number) => from + 1 === to,
	(map: MapObject, from: number, to: number) => from + map.cols === to,
	(map: MapObject, from: number, to: number) => from - 1 === to,
	(map: MapObject, from: number, to: number) => from - map.cols === to,
]

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
		resolve()
	})

export const animateExplosion = (map: MapObject, source: number) =>
	new Promise<void>((resolve) => {
		map
		source
		resolve()
	})
