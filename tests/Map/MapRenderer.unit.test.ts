import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/svelte'
import MapRender from '../../src/lib/Map/MapRender.svelte'
import { unitData } from '../../src/lib/GameData/unit'
import ContextlessScroller from '$lib/Scroller/ContextlessScroller.svelte'
import { buildingData } from '$lib/GameData/building'
import { writable } from 'svelte/store'

describe('MapRender.svelte', () => {
	afterEach(() => cleanup())

	it('mounts', () => {
		const { container } = renderConfiguredMap()
		expect(container).toBeTruthy()
		expect(container.innerHTML).toContain('Loader')
	})

	it('it render', async () => {
		const { container } = renderConfiguredMap(() => {})
		const inputHandler = container.querySelector('section[role="grid"]') as HTMLElement
		expect(inputHandler).toBeTruthy()
	})

	it('updates on button click', async () => {
		const [capture, checkCaptured] = (() => {
			let captured = false
			return [() => (captured = true), () => captured]
		})()
		const { prepared, container } = renderConfiguredMap(capture)
		// await prepared
		const inputHandler = container.querySelector('section[role="grid"]') as HTMLElement
		expect(inputHandler).toBeTruthy()
		await fireEvent.click(inputHandler)
		// expect(checkCaptured()).toBe(true)
	})
})

const renderConfiguredMap = (captureEvent?: (x: number, y: number) => void) => {
	const [reportFinished, getFinished] = (() => {
		let loaded = false
		return [(finished: boolean) => (loaded = finished), () => loaded]
	})()
	const prepared = new Promise<void>((resolve) => {
		const refresh = 1000
		const check = () => {
			if (getFinished()) {
				resolve()
			} else {
				setTimeout(check, refresh)
			}
		}
		setTimeout(check, refresh)
	})
	const contextLoaded = writable(!!captureEvent)
	const cols = 100
	const rows = 100
	const map = {
		rows,
		cols,
		layers: {
			ground: new Array(rows * cols).fill(0).map(() => ({
				type: Math.random() * 3 > 1 ? 4 : 0,
				state: 0,
			})),
			sky: new Array(rows * cols).fill(0).map((_, index) =>
				Math.floor(index / cols) !== 2
					? null
					: {
							type: Math.floor(Math.random() * 2),
							state: 0,
					  }
			),
			units: new Array(rows * cols).fill(0).map((_, index) =>
				index % cols !== 2
					? null
					: {
							type: Math.floor(Math.random() * unitData.length),
							team: index % 2,
							state: 4,
					  }
			),
			buildings: new Array(rows * cols).fill(0).map((_, index) =>
				index % cols !== 4
					? null
					: {
							type: Math.floor(Math.random() * buildingData.length),
							team: index % 2,
							state: 0,
					  }
			),
		},
		filters: {
			ground: (active) => active.map((data) => data.type),
			sky: (active) => active.filter((data) => data !== null).map((data) => data?.type),
			units: (active) => active.filter((data) => data !== null).map((data) => data?.type),
			buildings: (active) => active.filter((data) => data !== null).map((data) => data?.type),
		},
		highlights: [],
	} as MapObject
	const select = captureEvent ?? (() => {})
	const makeImage = (() => {
		const [startLoad, loaded] = ((finished) => {
			let images = 0
			const isFinished = (action: VoidFunction) => {
				action()
				finished(!!captureEvent)
			}

			return [
				() => isFinished(() => images++),
				(signalLoaded: VoidFunction) => () =>
					isFinished(() => {
						signalLoaded()
					}),
			]
		})(reportFinished)

		return () => (signalLoaded: (image: HTMLImageElement) => void) => {
			startLoad()
			loaded(() => signalLoaded(new Image()))()
		}
	})()
	const colorizer = () => (originalImage: HTMLImageElement) => originalImage

	return {
		...render(MapRender, {
			map,
			scroller: ContextlessScroller,
			select,
			makeImage,
			colorizer,
			contextLoaded,
		}),
		prepared,
	}
}
