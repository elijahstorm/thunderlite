/*
 * Scroller
 * http://github.com/zynga/scroller
 *
 * Copyright 2011, Zynga Inc.
 * Licensed under the MIT License.
 * https://raw.github.com/zynga/scroller/master/MIT-LICENSE.txt
 */

/**
 * Helper class for doing tile distribution and paint callbacks on a predefined area when
 * location to render is being modified.
 */

export type Tiling = {
	__clientWidth: number
	__clientHeight: number
	__contentWidth: number
	__contentHeight: number
	__tileWidth: number
	__tileHeight: number
	setup: (args: {
		clientWidth: number
		clientHeight: number
		contentWidth: number
		contentHeight: number
		tileWidth: number
		tileHeight: number
	}) => void
	render: (
		signalOffset: (left: number, top: number, zoom: number) => void,
		paint: (
			row: number,
			col: number,
			currentLeft: number,
			currentTop: number,
			tileWidth: number,
			tileHeight: number,
			zoom: number
		) => void
	) => (left: number, top: number, zoom: number) => void
}

export const MakeTiling: () => Tiling = () => ({
	__clientWidth: 0,
	__clientHeight: 0,
	__contentWidth: 0,
	__contentHeight: 0,
	__tileWidth: 0,
	__tileHeight: 0,

	/**
	 * This method is required to being called every time the tile, outer or inner dimensions are being modified.
	 *
	 * @param clientWidth {Number} Inner width of container
	 * @param clientHeight {Number} Inner height of container
	 * @param contentWidth {Number} Outer width of content
	 * @param contentHeight {Number} Outer height of content
	 * @param tileWidth {Number} Width of each tile to render
	 * @param tileHeight {Number} Height of each tile to render
	 */
	setup: function ({
		clientWidth,
		clientHeight,
		contentWidth,
		contentHeight,
		tileWidth,
		tileHeight,
	}) {
		this.__clientWidth = clientWidth
		this.__clientHeight = clientHeight
		this.__contentWidth = contentWidth
		this.__contentHeight = contentHeight
		this.__tileWidth = tileWidth
		this.__tileHeight = tileHeight
	},

	/**
	 * Renders the given location on the area defined by {@link #setup} by calling
	 * `paint(row, column, left, top, width, height, zoom)` as needed.
	 *
	 * @param left {Number} Left position to render
	 * @param top {Number} Top position to render
	 * @param zoom {Number} Current zoom level (should be applied to `left` and `top` already)
	 * @param paint {Function} Callback method for every tile to paint.
	 */
	render: function (signalOffset, paint) {
		return (left, top, zoom) => {
			signalOffset(left, top, zoom)

			const clientHeight = this.__clientHeight
			const clientWidth = this.__clientWidth

			// Respect zooming
			const tileHeight = this.__tileHeight * zoom
			const tileWidth = this.__tileWidth * zoom

			// Compute starting rows/columns and support out of range scroll positions
			const startRow = Math.max(Math.floor(top / tileHeight), 0)
			const startCol = Math.max(Math.floor(left / tileWidth), 0)

			// Compute maximum rows/columns to render for content size
			const maxRows = (this.__contentHeight * zoom) / tileHeight
			const maxCols = (this.__contentWidth * zoom) / tileWidth

			// Compute initial render offsets
			// 1. Positive scroll position: We match the starting rows/tile first so we
			//    just need to take care that the half-visible tile is fully rendered
			//    and placed partly outside.
			// 2. Negative scroll position: We shift the whole render context
			//    (ignoring the tile dimensions) and effectively reduce the render
			//    dimensions by the scroll amount.
			const startTop = top >= 0 ? -top % tileHeight : -top
			const startLeft = left >= 0 ? -left % tileWidth : -left

			// Compute number of rows to render
			let rows = Math.floor(clientHeight / tileHeight)

			if (top % tileHeight > 0) {
				rows += 1
			}

			if (startTop + rows * tileHeight < clientHeight) {
				rows += 1
			}

			// Compute number of columns to render
			let cols = Math.floor(clientWidth / tileWidth)

			if (left % tileWidth > 0) {
				cols += 1
			}

			if (startLeft + cols * tileWidth < clientWidth) {
				cols += 1
			}

			// Limit rows/columns to maximum numbers
			rows = Math.min(rows, maxRows - startRow)
			cols = Math.min(cols, maxCols - startCol)

			// Initialize looping variables
			let currentTop = startTop
			let currentLeft = startLeft

			// Render new squares
			for (let row = startRow; row < rows + startRow; row++) {
				for (let col = startCol; col < cols + startCol; col++) {
					paint(row, col, currentLeft, currentTop, tileWidth, tileHeight, zoom)
					currentLeft += tileWidth
				}

				currentLeft = startLeft
				currentTop += tileHeight
			}
		}
	},
})
