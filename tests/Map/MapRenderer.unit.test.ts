import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/svelte'
import MapRender from '../../src/lib/Map/MapRender.svelte'
import { unitData } from '../../src/lib/GameData/unit'

describe('MapRender.svelte', () => {
	afterEach(() => cleanup())

	it('mounts', () => {
		const { container } = renderConfiguredMap()
		expect(container).toBeTruthy()
		expect(container.innerHTML).toContain('loading')
	})

	it('updates on button click', async () => {
		let captured = false
		const { prepared, container } = renderConfiguredMap(() => {
			captured = true
		})
		await prepared
		expect(container.innerHTML).toContain('canvas')
		await fireEvent.click(container)
		expect(captured).toBe(true)
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
			units: new Array(rows * cols).fill(0).map((_, index) =>
				index % cols !== 2
					? null
					: {
							type: Math.floor(Math.random() * unitData.length),
							team: index % 2,
							state: 4,
					  }
			),
			sky: new Array(rows * cols).fill(0).map((_, index) =>
				Math.floor(index / cols) !== 2
					? null
					: {
							type: Math.floor(Math.random() * 2),
							state: 0,
					  }
			),
		},
		filters: {
			ground: (active) => active.map((data) => data.type),
			units: (active) => active.filter((data) => data !== null).map((data) => data?.type),
			sky: (active) => active.filter((data) => data !== null).map((data) => data?.type),
		},
	} as MapObject
	const select = captureEvent ?? (() => {})
	const makeImage = (() => {
		const [startLoad, loaded] = ((finished) => {
			let images = 0
			let loadedCount = 0
			const isFinished = (action: VoidFunction) => {
				action()
				finished(loadedCount === images)
			}

			return [
				() => isFinished(() => images++),
				(signalLoaded: VoidFunction) => () =>
					isFinished(() => {
						loadedCount++
						signalLoaded()
					}),
			]
		})(reportFinished)

		return () => (signalLoaded: (image: HTMLImageElement) => void) => {
			startLoad()
			loaded(() => signalLoaded(new Image()))()
		}
	})()

	return { ...render(MapRender, { map, select, makeImage, loaded: false }), prepared }
}