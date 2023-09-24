/* eslint-disable @typescript-eslint/no-unused-vars */

import { Animate } from './Animate'

type RenderFunction = (left: number, top: number, zoom: number) => void
type ScrollerOptions = {
	scrollingX?: boolean
	scrollingY?: boolean
	animating?: boolean
	animationDuration?: number
	bouncing?: boolean
	locking?: boolean
	paging?: boolean
	snapping?: boolean
	zooming?: boolean
	minZoom?: number
	maxZoom?: number
	speedMultiplier?: number
	scrollingComplete?: VoidFunction
	penetrationDeceleration?: number
	penetrationAcceleration?: number
}

/**
 * @param pos position between 0 (start of effect) and 1 (end of effect)
 **/
const easeOutCubic = function (pos: number) {
	return Math.pow(pos - 1, 3) + 1
}

/**
 * @param pos position between 0 (start of effect) and 1 (end of effect)
 **/
const easeInOutCubic = function (pos: number) {
	if ((pos /= 0.5) < 1) {
		return 0.5 * Math.pow(pos, 3)
	}

	return 0.5 * (Math.pow(pos - 2, 3) + 2)
}

const scrollerMembers = function () {
	const scroller: {
		setPosition: (left: number, top: number) => void
		__isSingleTouch: boolean
		__isTracking: boolean
		__didDecelerationComplete: boolean
		__isGesturing: boolean
		__isDragging: boolean
		__isDecelerating: number
		__isAnimating: number
		__clientLeft: number
		__clientTop: number
		__clientWidth: number
		__clientHeight: number
		__contentWidth: number
		__contentHeight: number
		__snapWidth: number
		__snapHeight: number
		__refreshHeight: number | null
		__refreshActive: boolean
		__refreshActivate: VoidFunction | null
		__refreshDeactivate: VoidFunction | null
		__refreshStart: VoidFunction | null
		__zoomLevel: number
		__scrollLeft: number
		__scrollTop: number
		__maxScrollLeft: number
		__maxScrollTop: number
		__scheduledLeft: number
		__scheduledTop: number
		__scheduledZoom: number
		__lastTouchLeft: number | null
		__lastTouchTop: number | null
		__lastTouchMove: Date | null
		__positions: number[]
		__minDecelerationScrollLeft: number | null
		__minDecelerationScrollTop: number | null
		__maxDecelerationScrollLeft: number | null
		__maxDecelerationScrollTop: number | null
		__decelerationVelocityX: number | null
		__decelerationVelocityY: number | null
		setDimensions: (
			clientWidth: number,
			clientHeight: number,
			contentWidth: number,
			contentHeight: number
		) => void
		__computeScrollMax: (zoomLevel?: number) => void
		scrollTo: (left: number, top: number, animate?: boolean, zoom?: number) => void
		setSnapSize: (width: number, height: number) => void
		activatePullToRefresh: (
			height: number,
			activateCallback: VoidFunction,
			deactivateCallback: VoidFunction,
			startCallback: VoidFunction
		) => void
		triggerPullToRefresh: VoidFunction
		finishPullToRefresh: VoidFunction
		getValues: () => {
			left: number
			top: number
			zoom: number
		}
		getScrollMax: () => {
			left: number
			top: number
		}
		zoomTo: (
			level: number,
			animate?: boolean,
			originLeft?: number | null,
			originTop?: number | null,
			callback?: VoidFunction | null
		) => void
		options: ScrollerOptions
		__zoomComplete: VoidFunction | null
		__publish: (left: number, top: number, zoom: number, animate?: boolean) => void
		zoomBy: (
			factor: number,
			animate?: boolean,
			originLeft?: number,
			originTop?: number,
			callback?: VoidFunction | null
		) => void
		scrollBy: (left: number, top: number, animate: boolean) => void
		doMouseZoom: (wheelDelta: number, timeStamp: unknown, pageX: number, pageY: number) => void
		doTouchStart: (touches: TouchList, timeStamp: Date | number | null) => void
		__interruptedAnimation: boolean
		__initialTouchLeft: number
		__initialTouchTop: number
		__zoomLevelStart: number
		__lastScale: number
		__enableScrollX: boolean
		__enableScrollY: boolean
		doTouchMove: (touches: TouchList, timeStamp: Date | number | null, scale: number) => void
		doTouchEnd: (timeStampe: Date | number) => void
		__startDeceleration: VoidFunction
		customRender: (left: number, top: number, zoom: number) => void
		__stepThroughDeceleration: (render: boolean) => void
	} = {
		/*
			---------------------------------------------------------------------------
				INTERNAL FIELDS :: STATUS
			---------------------------------------------------------------------------
			*/
		/** Whether only a single finger is used in touch handling */
		__isSingleTouch: false,

		/** Whether a touch event sequence is in progress */
		__isTracking: false,

		/** Whether a deceleration animation went to completion. */
		__didDecelerationComplete: false,

		/**
		 * Whether a gesture zoom/rotate event is in progress. Activates when
		 * a gesturestart event happens. This has higher priority than dragging.
		 */
		__isGesturing: false,

		/**
		 * Whether the user has moved by such a distance that we have enabled
		 * dragging mode. Hint: It's only enabled after some pixels of movement to
		 * not interrupt with clicks etc.
		 */
		__isDragging: false,

		/**
		 * Not touching and dragging anymore, and smoothly animating the
		 * touch sequence using deceleration.
		 */
		__isDecelerating: 0,

		/**
		 * Smoothly animating the currently configured change
		 */
		__isAnimating: 0,

		/*
			---------------------------------------------------------------------------
				INTERNAL FIELDS :: DIMENSIONS
			---------------------------------------------------------------------------
			*/
		/** Available outer left position (from document perspective) */
		__clientLeft: 0,

		/** Available outer top position (from document perspective) */
		__clientTop: 0,

		/** Available outer width */
		__clientWidth: 0,

		/** Available outer height */
		__clientHeight: 0,

		/** Outer width of content */
		__contentWidth: 0,

		/** Outer height of content */
		__contentHeight: 0,

		/** Snapping width for content */
		__snapWidth: 100,

		/** Snapping height for content */
		__snapHeight: 100,

		/** Height to assign to refresh area */
		__refreshHeight: null,

		/** Whether the refresh process is enabled when the event is released now */
		__refreshActive: false,

		/** Callback to execute on activation. This is for signalling the user about a refresh is about to happen when he release */
		__refreshActivate: null,

		/** Callback to execute on deactivation. This is for signalling the user about the refresh being cancelled */
		__refreshDeactivate: null,

		/** Callback to execute to start the actual refresh. Call {@link #refreshFinish} when done */
		__refreshStart: null,

		/** Zoom level */
		__zoomLevel: 1,

		/** Scroll position on x-axis */
		__scrollLeft: 0,

		/** Scroll position on y-axis */
		__scrollTop: 0,

		/** Maximum allowed scroll position on x-axis */
		__maxScrollLeft: 0,

		/** Maximum allowed scroll position on y-axis */
		__maxScrollTop: 0,

		/* Scheduled left position (final position when animating) */
		__scheduledLeft: 0,

		/* Scheduled top position (final position when animating) */
		__scheduledTop: 0,

		/* Scheduled zoom level (final scale when animating) */
		__scheduledZoom: 0,

		/*
			---------------------------------------------------------------------------
				INTERNAL FIELDS :: LAST POSITIONS
			---------------------------------------------------------------------------
			*/
		/** Left position of finger at start */
		__lastTouchLeft: null,

		/** Top position of finger at start */
		__lastTouchTop: null,

		/** Timestamp of last move of finger. Used to limit tracking range for deceleration speed. */
		__lastTouchMove: null,

		/** List of positions, uses three indexes for each state: left, top, timestamp */
		__positions: [],

		/*
			---------------------------------------------------------------------------
				INTERNAL FIELDS :: DECELERATION SUPPORT
			---------------------------------------------------------------------------
			*/
		/** Minimum left scroll position during deceleration */
		__minDecelerationScrollLeft: null,

		/** Minimum top scroll position during deceleration */
		__minDecelerationScrollTop: null,

		/** Maximum left scroll position during deceleration */
		__maxDecelerationScrollLeft: null,

		/** Maximum top scroll position during deceleration */
		__maxDecelerationScrollTop: null,

		/** Current factor to modify horizontal scroll position with on every step */
		__decelerationVelocityX: null,

		/** Current factor to modify vertical scroll position with on every step */
		__decelerationVelocityY: null,
		setPosition: function (left: number, top: number): void {},
		setDimensions: function (
			clientWidth: number,
			clientHeight: number,
			contentWidth: number,
			contentHeight: number
		): void {},
		__computeScrollMax: function (zoomLevel?: number | undefined): void {},
		scrollTo: function (
			left: number,
			top: number,
			animate?: boolean | undefined,
			zoom?: number | undefined
		): void {},
		setSnapSize: function (width: number, height: number): void {},
		activatePullToRefresh: function (
			height: number,
			activateCallback: VoidFunction,
			deactivateCallback: VoidFunction,
			startCallback: VoidFunction
		): void {},
		triggerPullToRefresh: () => {},
		finishPullToRefresh: () => {},
		getValues: function (): { left: number; top: number; zoom: number } {
			return { left: 0, top: 0, zoom: 0 }
		},
		getScrollMax: function (): { left: number; top: number } {
			return { left: 0, top: 0 }
		},
		zoomTo: function (
			level: number,
			animate?: boolean,
			originLeft?: number | null,
			originTop?: number | null,
			callback?: VoidFunction | null | undefined
		): void {},
		options: {
			scrollingX: undefined,
			scrollingY: undefined,
			animating: undefined,
			animationDuration: undefined,
			bouncing: undefined,
			locking: undefined,
			paging: undefined,
			snapping: undefined,
			zooming: undefined,
			minZoom: undefined,
			maxZoom: undefined,
			speedMultiplier: undefined,
			scrollingComplete: undefined,
			penetrationDeceleration: undefined,
			penetrationAcceleration: undefined,
		},
		__zoomComplete: null,
		__publish: function (
			left: number,
			top: number,
			zoom: number,
			animate?: boolean | undefined
		): void {},
		zoomBy: function (
			factor: number,
			animate?: boolean,
			originLeft?: number,
			originTop?: number,
			callback?: VoidFunction | null | undefined
		): void {},
		scrollBy: function (left: number, top: number, animate: boolean): void {},
		doMouseZoom: function (
			wheelDelta: number,
			timeStamp: unknown,
			pageX: number,
			pageY: number
		): void {},
		doTouchStart: function (touches: TouchList, timeStamp: number | Date | null): void {},
		__interruptedAnimation: false,
		__initialTouchLeft: 0,
		__initialTouchTop: 0,
		__zoomLevelStart: 0,
		__lastScale: 0,
		__enableScrollX: false,
		__enableScrollY: false,
		doTouchMove: function (
			touches: TouchList,
			timeStamp: number | Date | null,
			scale: number
		): void {},
		doTouchEnd: function (timeStampe: number | Date): void {},
		__startDeceleration: () => {},
		customRender: function (left: number, top: number, zoom: number): void {},
		__stepThroughDeceleration: function (render: boolean): void {},
	}

	/*
		---------------------------------------------------------------------------
			PUBLIC API
		---------------------------------------------------------------------------
		*/

	/**
	 * Configures the dimensions of the client (outer) and content (inner) elements.
	 * Requires the available space for the outer element and the outer size of the inner element.
	 * All values which are falsy (null or zero etc.) are ignored and the old value is kept.
	 *
	 * @param clientWidth Inner width of outer element
	 * @param clientHeight Inner height of outer element
	 * @param contentWidth Outer width of inner element
	 * @param contentHeight Outer height of inner element
	 */
	scroller.setDimensions = function (
		clientWidth: number,
		clientHeight: number,
		contentWidth: number,
		contentHeight: number
	) {
		// Only update values which are defined
		if (clientWidth === +clientWidth) {
			scroller.__clientWidth = clientWidth
		}

		if (clientHeight === +clientHeight) {
			scroller.__clientHeight = clientHeight
		}

		if (contentWidth === +contentWidth) {
			scroller.__contentWidth = contentWidth
		}

		if (contentHeight === +contentHeight) {
			scroller.__contentHeight = contentHeight
		}

		// Refresh maximums
		scroller.__computeScrollMax()

		// Refresh scroll position
		scroller.scrollTo(scroller.__scrollLeft, scroller.__scrollTop, true)
	}

	/**
	 * Sets the client coordinates in relation to the document.
	 *
	 * @param left Left position of outer element
	 * @param top Top position of outer element
	 */
	scroller.setPosition = function (left: number, top: number) {
		scroller.__clientLeft = left || 0
		scroller.__clientTop = top || 0
	}

	/**
	 * Configures the snapping (when snapping is active)
	 *
	 * @param width Snapping width
	 * @param height Snapping height
	 */
	scroller.setSnapSize = function (width: number, height: number) {
		scroller.__snapWidth = width
		scroller.__snapHeight = height
	}

	/**
	 * Activates pull-to-refresh. A special zone on the top of the list to start a list refresh whenever
	 * the user event is released during visibility of this zone. This was introduced by some apps on iOS like
	 * the official Twitter client.
	 *
	 * @param height Height of pull-to-refresh zone on top of rendered list
	 * @param activateCallback Callback to execute on activation. This is for signalling the user about a refresh is about to happen when he release.
	 * @param deactivateCallback Callback to execute on deactivation. This is for signalling the user about the refresh being cancelled.
	 * @param startCallback Callback to execute to start the real async refresh action. Call {@link #finishPullToRefresh} after finish of refresh.
	 */
	;(scroller.activatePullToRefresh = function (
		height: number,
		activateCallback: VoidFunction | null,
		deactivateCallback: VoidFunction | null,
		startCallback: VoidFunction | null
	) {
		scroller.__refreshHeight = height
		scroller.__refreshActivate = activateCallback
		scroller.__refreshDeactivate = deactivateCallback
		scroller.__refreshStart = startCallback
	}),
		/**
		 * Starts pull-to-refresh manually.
		 */
		(scroller.triggerPullToRefresh = function () {
			// Use publish instead of scrollTo to allow scrolling to out of boundary position
			// We don't need to normalize scrollLeft, zoomLevel, etc. here because we only y-scrolling when pull-to-refresh is enabled
			scroller.__publish(
				scroller.__scrollLeft,
				scroller.__refreshHeight ? -scroller.__refreshHeight : 0,
				scroller.__zoomLevel,
				true
			)

			if (scroller.__refreshStart) {
				scroller.__refreshStart()
			}
		}),
		/**
		 * Signalizes that pull-to-refresh is finished.
		 */
		(scroller.finishPullToRefresh = function () {
			scroller.__refreshActive = false
			if (scroller.__refreshDeactivate) {
				scroller.__refreshDeactivate()
			}

			scroller.scrollTo(scroller.__scrollLeft, scroller.__scrollTop, true)
		}),
		/**
		 * Returns the scroll position and zooming values
		 *
		 * @return `left` and `top` scroll position and `zoom` level
		 */
		(scroller.getValues = function () {
			return {
				left: scroller.__scrollLeft,
				top: scroller.__scrollTop,
				zoom: scroller.__zoomLevel,
			}
		}),
		/**
		 * Returns the maximum scroll values
		 *
		 * @return `left` and `top` maximum scroll values
		 */
		(scroller.getScrollMax = function () {
			return {
				left: scroller.__maxScrollLeft,
				top: scroller.__maxScrollTop,
			}
		}),
		/**
		 * Zooms to the given level. Supports optional animation. Zooms
		 * the center when no coordinates are given.
		 *
		 * @param level Level to zoom to
		 * @param animate Whether to use animation
		 * @param originLeft Zoom in at given left coordinate
		 * @param originTop Zoom in at given top coordinate
		 * @param callback A callback that gets fired when the zoom is complete.
		 */
		(scroller.zoomTo = function (
			level: number,
			animate?: boolean,
			originLeft?: number | null,
			originTop?: number | null,
			callback?: VoidFunction | null
		) {
			if (!scroller.options.zooming) {
				return
			}

			// Add callback if exists
			if (callback) {
				scroller.__zoomComplete = callback
			}

			// Stop deceleration
			if (scroller.__isDecelerating) {
				Animate.stop(scroller.__isDecelerating)
				scroller.__isDecelerating = 0
			}

			const oldLevel = scroller.__zoomLevel

			// Normalize input origin to center of viewport if not defined
			if (originLeft == null) {
				originLeft = scroller.__clientWidth / 2
			}

			if (originTop == null) {
				originTop = scroller.__clientHeight / 2
			}

			// Limit level according to configuration
			level = Math.max(
				Math.min(level, scroller.options.maxZoom ?? 3),
				scroller.options.minZoom ?? 0.5
			)

			// Recompute maximum values while temporary tweaking maximum scroll ranges
			scroller.__computeScrollMax(level)

			// Recompute left and top coordinates based on new zoom level
			let left = ((originLeft + scroller.__scrollLeft) * level) / oldLevel - originLeft
			let top = ((originTop + scroller.__scrollTop) * level) / oldLevel - originTop

			// Limit x-axis
			if (left > scroller.__maxScrollLeft) {
				left = scroller.__maxScrollLeft
			} else if (left < 0) {
				left = 0
			}

			// Limit y-axis
			if (top > scroller.__maxScrollTop) {
				top = scroller.__maxScrollTop
			} else if (top < 0) {
				top = 0
			}

			// Push values out
			scroller.__publish(left, top, level, animate)
		}),
		/**
		 * Zooms the content by the given factor.
		 *
		 * @param factor Zoom by given factor
		 * @param animate Whether to use animation
		 * @param originLeft Zoom in at given left coordinate
		 * @param originTop Zoom in at given top coordinate
		 * @param callback A callback that gets fired when the zoom is complete.
		 */
		(scroller.zoomBy = function (
			factor: number,
			animate?: boolean,
			originLeft?: number,
			originTop?: number,
			callback?: VoidFunction | null
		) {
			scroller.zoomTo(scroller.__zoomLevel * factor, animate, originLeft, originTop, callback)
		}),
		/**
		 * Scrolls to the given position. Respect limitations and snapping automatically.
		 *
		 * @param left Horizontal scroll position, keeps current if value is <code>null</code>
		 * @param top Vertical scroll position, keeps current if value is <code>null</code>
		 * @param animate Whether the scrolling should happen using an animation
		 * @param zoom Zoom level to go to
		 */
		(scroller.scrollTo = function (left: number, top: number, animate?: boolean, zoom?: number) {
			// Stop deceleration
			if (scroller.__isDecelerating) {
				Animate.stop(scroller.__isDecelerating)
				scroller.__isDecelerating = 0
			}

			// Correct coordinates based on new zoom level
			if (zoom && zoom !== scroller.__zoomLevel) {
				if (!scroller.options.zooming) {
					return
				}

				left *= zoom
				top *= zoom

				// Recompute maximum values while temporary tweaking maximum scroll ranges
				scroller.__computeScrollMax(zoom)
			} else {
				// Keep zoom when not defined
				zoom = scroller.__zoomLevel
			}

			if (!scroller.options.scrollingX) {
				left = scroller.__scrollLeft
			} else {
				if (scroller.options.paging) {
					left = Math.round(left / scroller.__clientWidth) * scroller.__clientWidth
				} else if (scroller.options.snapping) {
					left = Math.round(left / scroller.__snapWidth) * scroller.__snapWidth
				}
			}

			if (!scroller.options.scrollingY) {
				top = scroller.__scrollTop
			} else {
				if (scroller.options.paging) {
					top = Math.round(top / scroller.__clientHeight) * scroller.__clientHeight
				} else if (scroller.options.snapping) {
					top = Math.round(top / scroller.__snapHeight) * scroller.__snapHeight
				}
			}

			// Limit for allowed ranges
			left = Math.max(Math.min(scroller.__maxScrollLeft, left), 0)
			top = Math.max(Math.min(scroller.__maxScrollTop, top), 0)

			// Don't animate when no change detected, still call publish to make sure
			// that rendered position is really in-sync with internal data
			if (left === scroller.__scrollLeft && top === scroller.__scrollTop) {
				animate = false
			}

			// Publish new values
			if (!scroller.__isTracking) {
				scroller.__publish(left, top, zoom, animate)
			}
		}),
		/**
		 * Scroll by the given offset
		 *
		 * @param left Scroll x-axis by given offset
		 * @param top Scroll x-axis by given offset
		 * @param animate Whether to animate the given change
		 */
		(scroller.scrollBy = function (left: number, top: number, animate: boolean) {
			const startLeft = scroller.__isAnimating ? scroller.__scheduledLeft : scroller.__scrollLeft
			const startTop = scroller.__isAnimating ? scroller.__scheduledTop : scroller.__scrollTop

			scroller.scrollTo(startLeft + (left || 0), startTop + (top || 0), animate)
		})

	/*
		---------------------------------------------------------------------------
			EVENT CALLBACKS
		---------------------------------------------------------------------------
		*/

	/**
	 * Mouse wheel handler for zooming support
	 */
	scroller.doMouseZoom = function (
		wheelDelta: number,
		timeStamp: unknown,
		pageX: number,
		pageY: number
	) {
		const change = wheelDelta > 0 ? 0.97 : 1.03

		scroller.zoomTo(
			scroller.__zoomLevel * change,
			false,
			pageX - scroller.__clientLeft,
			pageY - scroller.__clientTop
		)
	}

	/**
	 * Touch start handler for scrolling support
	 */
	scroller.doTouchStart = function (touches: TouchList, timeStamp: Date | number | null) {
		// Array-like check is enough here
		if (touches.length == null) {
			throw new Error('Invalid touch list: ' + touches)
		}

		if (timeStamp instanceof Date) {
			timeStamp = timeStamp.valueOf()
		}
		if (typeof timeStamp !== 'number') {
			throw new Error('Invalid timestamp value: ' + timeStamp)
		}

		// Reset interruptedAnimation flag
		scroller.__interruptedAnimation = true

		// Stop deceleration
		if (scroller.__isDecelerating) {
			Animate.stop(scroller.__isDecelerating)
			scroller.__isDecelerating = 0
			scroller.__interruptedAnimation = true
		}

		// Stop animation
		if (scroller.__isAnimating) {
			Animate.stop(scroller.__isAnimating)
			scroller.__isAnimating = 0
			scroller.__interruptedAnimation = true
		}

		// Use center point when dealing with two fingers
		let currentTouchLeft, currentTouchTop
		const isSingleTouch = touches.length === 1
		if (isSingleTouch) {
			currentTouchLeft = touches[0].pageX
			currentTouchTop = touches[0].pageY
		} else {
			currentTouchLeft = Math.abs(touches[0].pageX + touches[1].pageX) / 2
			currentTouchTop = Math.abs(touches[0].pageY + touches[1].pageY) / 2
		}

		// Store initial positions
		scroller.__initialTouchLeft = currentTouchLeft
		scroller.__initialTouchTop = currentTouchTop

		// Store current zoom level
		scroller.__zoomLevelStart = scroller.__zoomLevel

		// Store initial touch positions
		scroller.__lastTouchLeft = currentTouchLeft
		scroller.__lastTouchTop = currentTouchTop

		// Store initial move time stamp
		scroller.__lastTouchMove = new Date(timeStamp)

		// Reset initial scale
		scroller.__lastScale = 1

		// Reset locking flags
		scroller.__enableScrollX = (!isSingleTouch && scroller.options.scrollingX) || false
		scroller.__enableScrollY = (!isSingleTouch && scroller.options.scrollingY) || false

		// Reset tracking flag
		scroller.__isTracking = true

		// Reset deceleration complete flag
		scroller.__didDecelerationComplete = false

		// Dragging starts directly with two fingers, otherwise lazy with an offset
		scroller.__isDragging = !isSingleTouch

		// Some features are disabled in multi touch scenarios
		scroller.__isSingleTouch = isSingleTouch

		// Clearing data structure
		scroller.__positions = []
	}

	/**
	 * Touch move handler for scrolling support
	 */
	scroller.doTouchMove = function (
		touches: TouchList,
		timeStamp: Date | number | null,
		scale: number
	) {
		// Array-like check is enough here
		if (touches.length == null) {
			throw new Error('Invalid touch list: ' + touches)
		}

		if (timeStamp instanceof Date) {
			timeStamp = timeStamp.valueOf()
		}
		if (typeof timeStamp !== 'number') {
			throw new Error('Invalid timestamp value: ' + timeStamp)
		}

		// Ignore event when tracking is not enabled (event might be outside of element)
		if (!scroller.__isTracking) {
			return
		}

		let currentTouchLeft, currentTouchTop

		// Compute move based around of center of fingers
		if (touches.length === 2) {
			currentTouchLeft = Math.abs(touches[0].pageX + touches[1].pageX) / 2
			currentTouchTop = Math.abs(touches[0].pageY + touches[1].pageY) / 2
		} else {
			currentTouchLeft = touches[0].pageX
			currentTouchTop = touches[0].pageY
		}

		const positions = scroller.__positions

		// Are we already is dragging mode?
		if (scroller.__isDragging && scroller.__lastTouchLeft && scroller.__lastTouchTop) {
			// Compute move distance
			const moveX = currentTouchLeft - scroller.__lastTouchLeft
			const moveY = currentTouchTop - scroller.__lastTouchTop

			// Read previous scroll position and zooming
			let scrollLeft = scroller.__scrollLeft
			let scrollTop = scroller.__scrollTop
			let level = scroller.__zoomLevel

			// Work with scaling
			if (scale != null && scroller.options.zooming) {
				const oldLevel = level

				// Recompute level based on previous scale and new scale
				level = (level / scroller.__lastScale) * scale

				// Limit level according to configuration
				level = Math.max(
					Math.min(level, scroller.options.maxZoom ?? 3),
					scroller.options.minZoom ?? 0.5
				)

				// Only do further compution when change happened
				if (oldLevel !== level) {
					// Compute relative event position to container
					const currentTouchLeftRel = currentTouchLeft - scroller.__clientLeft
					const currentTouchTopRel = currentTouchTop - scroller.__clientTop

					// Recompute left and top coordinates based on new zoom level
					scrollLeft = ((currentTouchLeftRel + scrollLeft) * level) / oldLevel - currentTouchLeftRel
					scrollTop = ((currentTouchTopRel + scrollTop) * level) / oldLevel - currentTouchTopRel

					// Recompute max scroll values
					scroller.__computeScrollMax(level)
				}
			}

			if (scroller.__enableScrollX && scroller.options.speedMultiplier) {
				scrollLeft -= moveX * scroller.options.speedMultiplier
				const maxScrollLeft = scroller.__maxScrollLeft

				if (scrollLeft > maxScrollLeft || scrollLeft < 0) {
					// Slow down on the edges
					if (scroller.options.bouncing) {
						scrollLeft += (moveX / 2) * scroller.options.speedMultiplier
					} else if (scrollLeft > maxScrollLeft) {
						scrollLeft = maxScrollLeft
					} else {
						scrollLeft = 0
					}
				}
			}

			// Compute new vertical scroll position
			if (scroller.__enableScrollY && scroller.options.speedMultiplier) {
				scrollTop -= moveY * scroller.options.speedMultiplier
				const maxScrollTop = scroller.__maxScrollTop

				if (scrollTop > maxScrollTop || scrollTop < 0) {
					// Slow down on the edges
					if (scroller.options.bouncing) {
						scrollTop += (moveY / 2) * scroller.options.speedMultiplier

						// Support pull-to-refresh (only when only y is scrollable)
						if (!scroller.__enableScrollX && scroller.__refreshHeight != null) {
							if (!scroller.__refreshActive && scrollTop <= -scroller.__refreshHeight) {
								scroller.__refreshActive = true
								if (scroller.__refreshActivate) {
									scroller.__refreshActivate()
								}
							} else if (scroller.__refreshActive && scrollTop > -scroller.__refreshHeight) {
								scroller.__refreshActive = false
								if (scroller.__refreshDeactivate) {
									scroller.__refreshDeactivate()
								}
							}
						}
					} else if (scrollTop > maxScrollTop) {
						scrollTop = maxScrollTop
					} else {
						scrollTop = 0
					}
				}
			}

			// Keep list from growing infinitely (holding min 10, max 20 measure points)
			if (positions && positions.length > 60) {
				positions.splice(0, 30)
			}

			// Track scroll movement for decleration
			positions?.push(scrollLeft, scrollTop, timeStamp)

			// Sync scroll position
			scroller.__publish(scrollLeft, scrollTop, level)

			// Otherwise figure out whether we are switching into dragging mode now.
		} else {
			const minimumTrackingForScroll = scroller.options.locking ? 3 : 0
			const minimumTrackingForDrag = 5

			const distanceX = Math.abs(currentTouchLeft - scroller.__initialTouchLeft)
			const distanceY = Math.abs(currentTouchTop - scroller.__initialTouchTop)

			scroller.__enableScrollX = (scroller.options.scrollingX &&
				distanceX >= minimumTrackingForScroll) as boolean
			scroller.__enableScrollY = (scroller.options.scrollingY &&
				distanceY >= minimumTrackingForScroll) as boolean

			positions?.push(scroller.__scrollLeft, scroller.__scrollTop, timeStamp)

			scroller.__isDragging =
				(scroller.__enableScrollX || scroller.__enableScrollY) &&
				(distanceX >= minimumTrackingForDrag || distanceY >= minimumTrackingForDrag)
			if (scroller.__isDragging) {
				scroller.__interruptedAnimation = false
			}
		}

		// Update last touch positions and time stamp for next event
		scroller.__lastTouchLeft = currentTouchLeft
		scroller.__lastTouchTop = currentTouchTop
		scroller.__lastTouchMove = new Date(timeStamp)
		scroller.__lastScale = scale
	}

	/**
	 * Touch end handler for scrolling support
	 */
	scroller.doTouchEnd = function (timeStamp: Date | number) {
		if (timeStamp instanceof Date) {
			timeStamp = timeStamp.valueOf()
		}
		if (typeof timeStamp !== 'number') {
			throw new Error('Invalid timestamp value: ' + timeStamp)
		}

		// Ignore event when tracking is not enabled (no touchstart event on element)
		// This is required as this listener ('touchmove') sits on the document and not on the element itself.
		if (!scroller.__isTracking) {
			return
		}

		// Not touching anymore (when two finger hit the screen there are two touch end events)
		scroller.__isTracking = false

		// Be sure to reset the dragging flag now. Here we also detect whether
		// the finger has moved fast enough to switch into a deceleration animation.
		if (scroller.__isDragging) {
			// Reset dragging flag
			scroller.__isDragging = false

			// Start deceleration
			// Verify that the last move detected was in some relevant time frame
			if (
				scroller.__isSingleTouch &&
				scroller.options.animating &&
				scroller.__lastTouchMove &&
				timeStamp - scroller.__lastTouchMove.getMilliseconds() <= 100
			) {
				// Then figure out what the scroll position was about 100ms ago
				const positions = scroller.__positions
				const endPos = positions.length - 1
				let startPos = endPos

				// Move pointer to position measured 100ms ago
				for (
					let i = endPos;
					i > 0 && positions[i] > scroller.__lastTouchMove.getMilliseconds() - 100;
					i -= 3
				) {
					startPos = i
				}

				// If start and stop position is identical in a 100ms timeframe,
				// we cannot compute any useful deceleration.
				if (startPos !== endPos) {
					// Compute relative movement between these two points
					const timeOffset = positions[endPos] - positions[startPos]
					const movedLeft = scroller.__scrollLeft - positions[startPos - 2]
					const movedTop = scroller.__scrollTop - positions[startPos - 1]

					// Based on 50ms compute the movement to apply for each render step
					scroller.__decelerationVelocityX = (movedLeft / timeOffset) * (1000 / 60)
					scroller.__decelerationVelocityY = (movedTop / timeOffset) * (1000 / 60)

					// How much velocity is required to start the deceleration
					const minVelocityToStartDeceleration =
						scroller.options.paging || scroller.options.snapping ? 4 : 1

					// Verify that we have enough velocity to start deceleration
					if (
						Math.abs(scroller.__decelerationVelocityX) > minVelocityToStartDeceleration ||
						Math.abs(scroller.__decelerationVelocityY) > minVelocityToStartDeceleration
					) {
						// Deactivate pull-to-refresh when decelerating
						if (!scroller.__refreshActive) {
							scroller.__startDeceleration()
						}
					} else {
						if (scroller.options.scrollingComplete) {
							scroller.options.scrollingComplete()
						}
					}
				} else {
					if (scroller.options.scrollingComplete) {
						scroller.options.scrollingComplete()
					}
				}
			} else if (
				scroller.__lastTouchMove &&
				timeStamp - scroller.__lastTouchMove.getMilliseconds() > 100
			) {
				if (scroller.options.scrollingComplete) {
					scroller.options.scrollingComplete()
				}
			}
		}

		// If this was a slower move it is per default non decelerated, but this
		// still means that we want snap back to the bounds which is done here.
		// This is placed outside the condition above to improve edge case stability
		// e.g. touchend fired without enabled dragging. This should normally do not
		// have modified the scroll positions or even showed the scrollbars though.
		if (!scroller.__isDecelerating) {
			if (scroller.__refreshActive && scroller.__refreshStart) {
				// Use publish instead of scrollTo to allow scrolling to out of boundary position
				// We don't need to normalize scrollLeft, zoomLevel, etc. here because we only y-scrolling when pull-to-refresh is enabled
				scroller.__publish(
					scroller.__scrollLeft,
					scroller.__refreshHeight ? -scroller.__refreshHeight : 0,
					scroller.__zoomLevel,
					true
				)

				if (scroller.__refreshStart) {
					scroller.__refreshStart()
				}
			} else {
				if (scroller.__interruptedAnimation || scroller.__isDragging) {
					if (scroller.options.scrollingComplete) {
						scroller.options.scrollingComplete()
					}
				}
				scroller.scrollTo(scroller.__scrollLeft, scroller.__scrollTop, true, scroller.__zoomLevel)

				// Directly signalize deactivation (nothing todo on refresh?)
				if (scroller.__refreshActive) {
					scroller.__refreshActive = false
					if (scroller.__refreshDeactivate) {
						scroller.__refreshDeactivate()
					}
				}
			}
		}

		// Fully cleanup list
		scroller.__positions = []
	}

	/*
		---------------------------------------------------------------------------
			PRIVATE API
		---------------------------------------------------------------------------
		*/

	/**
	 * Applies the scroll position to the content element
	 *
	 * @param left Left scroll position
	 * @param top Top scroll position
	 * @param animate Whether animation should be used to move to the new coordinates
	 */
	scroller.__publish = function (left: number, top: number, zoom: number, animate?: boolean) {
		// Remember whether we had an animation, then we try to continue based on the current "drive" of the animation
		const wasAnimating = scroller.__isAnimating
		if (wasAnimating) {
			Animate.stop(wasAnimating)
			scroller.__isAnimating = 0
		}

		if (animate && scroller.options.animating) {
			// Keep scheduled positions for scrollBy/zoomBy functionality
			scroller.__scheduledLeft = left
			scroller.__scheduledTop = top
			scroller.__scheduledZoom = zoom

			const oldLeft = scroller.__scrollLeft
			const oldTop = scroller.__scrollTop
			const oldZoom = scroller.__zoomLevel

			const diffLeft = left - oldLeft
			const diffTop = top - oldTop
			const diffZoom = zoom - oldZoom

			const step = function (percent: number, now: unknown, render: boolean) {
				if (render) {
					scroller.__scrollLeft = oldLeft + diffLeft * percent
					scroller.__scrollTop = oldTop + diffTop * percent
					scroller.__zoomLevel = oldZoom + diffZoom * percent

					// Push values out
					if (scroller.customRender) {
						scroller.customRender(scroller.__scrollLeft, scroller.__scrollTop, scroller.__zoomLevel)
					}
				}
			}

			const verify = function (id: number) {
				return scroller.__isAnimating === id
			}

			const completed = function (animationId: number, wasFinished: number) {
				if (animationId === scroller.__isAnimating) {
					scroller.__isAnimating = 0
				}
				if (scroller.__didDecelerationComplete || wasFinished) {
					if (scroller.options.scrollingComplete) {
						scroller.options.scrollingComplete()
					}
				}

				if (scroller.options.zooming) {
					scroller.__computeScrollMax()
					if (scroller.__zoomComplete) {
						scroller.__zoomComplete()
						scroller.__zoomComplete = null
					}
				}
			}

			// When continuing based on previous animation we choose an ease-out animation instead of ease-in-out
			scroller.__isAnimating = Animate.start(
				step,
				verify,
				completed,
				scroller.options.animationDuration ?? 0,
				wasAnimating ? easeOutCubic : easeInOutCubic
			)
		} else {
			scroller.__scheduledLeft = scroller.__scrollLeft = left
			scroller.__scheduledTop = scroller.__scrollTop = top
			scroller.__scheduledZoom = scroller.__zoomLevel = zoom

			// Push values out
			if (scroller.customRender) {
				scroller.customRender(left, top, zoom)
			}

			// Fix max scroll ranges
			if (scroller.options.zooming) {
				scroller.__computeScrollMax()
				if (scroller.__zoomComplete) {
					scroller.__zoomComplete()
					scroller.__zoomComplete = null
				}
			}
		}
	}

	/**
	 * Recomputes scroll minimum values based on client dimensions and content dimensions.
	 */
	scroller.__computeScrollMax = function (zoomLevel?: number | null) {
		if (zoomLevel == null) {
			zoomLevel = scroller.__zoomLevel
		}

		scroller.__maxScrollLeft = Math.max(
			scroller.__contentWidth * zoomLevel - scroller.__clientWidth,
			0
		)
		scroller.__maxScrollTop = Math.max(
			scroller.__contentHeight * zoomLevel - scroller.__clientHeight,
			0
		)
	}

	/*
		---------------------------------------------------------------------------
			ANIMATION (DECELERATION) SUPPORT
		---------------------------------------------------------------------------
		*/

	/**
	 * Called when a touch sequence end and the speed of the finger was high enough
	 * to switch into deceleration mode.
	 */
	scroller.__startDeceleration = function () {
		if (scroller.options.paging) {
			const scrollLeft = Math.max(Math.min(scroller.__scrollLeft, scroller.__maxScrollLeft), 0)
			const scrollTop = Math.max(Math.min(scroller.__scrollTop, scroller.__maxScrollTop), 0)
			const clientWidth = scroller.__clientWidth
			const clientHeight = scroller.__clientHeight

			// We limit deceleration not to the min/max values of the allowed range, but to the size of the visible client area.
			// Each page should have exactly the size of the client area.
			scroller.__minDecelerationScrollLeft = Math.floor(scrollLeft / clientWidth) * clientWidth
			scroller.__minDecelerationScrollTop = Math.floor(scrollTop / clientHeight) * clientHeight
			scroller.__maxDecelerationScrollLeft = Math.ceil(scrollLeft / clientWidth) * clientWidth
			scroller.__maxDecelerationScrollTop = Math.ceil(scrollTop / clientHeight) * clientHeight
		} else {
			scroller.__minDecelerationScrollLeft = 0
			scroller.__minDecelerationScrollTop = 0
			scroller.__maxDecelerationScrollLeft = scroller.__maxScrollLeft
			scroller.__maxDecelerationScrollTop = scroller.__maxScrollTop
		}

		// Wrap class method
		const step = function (percent: unknown, now: unknown, render: boolean) {
			scroller.__stepThroughDeceleration(render)
		}

		// How much velocity is required to keep the deceleration running
		const minVelocityToKeepDecelerating = scroller.options.snapping ? 4 : 0.001

		// Detect whether it's still worth to continue animating steps
		// If we are already slow enough to not being user perceivable anymore, we stop the whole process here.
		const verify = function () {
			if (!scroller.__decelerationVelocityX || !scroller.__decelerationVelocityY) {
				return false
			}

			const shouldContinue =
				Math.abs(scroller.__decelerationVelocityX) >= minVelocityToKeepDecelerating ||
				Math.abs(scroller.__decelerationVelocityY) >= minVelocityToKeepDecelerating
			if (!shouldContinue) {
				scroller.__didDecelerationComplete = true
			}
			return shouldContinue
		}

		const completed = function () {
			scroller.__isDecelerating = 0
			if (scroller.__didDecelerationComplete) {
				if (scroller.options.scrollingComplete) {
					scroller.options.scrollingComplete()
				}
			}

			// Animate to grid when snapping is active, otherwise just fix out-of-boundary positions
			scroller.scrollTo(scroller.__scrollLeft, scroller.__scrollTop, scroller.options.snapping)
		}

		// Start animation and switch on flag
		scroller.__isDecelerating = Animate.start(step, verify, completed)
	}

	/**
	 * Called on every step of the animation
	 *
	 * @param render Whether to not render the current step, but keep it in memory only. Used internally only!
	 */
	scroller.__stepThroughDeceleration = function (render: boolean) {
		if (!scroller.__decelerationVelocityY || !scroller.__decelerationVelocityX) {
			return
		}

		//
		// COMPUTE NEXT SCROLL POSITION
		//

		// Add deceleration to scroll position
		let scrollLeft = scroller.__scrollLeft + scroller.__decelerationVelocityX
		let scrollTop = scroller.__scrollTop + scroller.__decelerationVelocityY

		//
		// HARD LIMIT SCROLL POSITION FOR NON BOUNCING MODE
		//

		if (!scroller.options.bouncing) {
			const scrollLeftFixed = Math.max(
				Math.min(scroller.__maxDecelerationScrollLeft ?? scrollLeft, scrollLeft),
				scroller.__minDecelerationScrollLeft ?? scrollLeft
			)
			if (scrollLeftFixed !== scrollLeft) {
				scrollLeft = scrollLeftFixed
				scroller.__decelerationVelocityX = 0
			}

			const scrollTopFixed = Math.max(
				Math.min(scroller.__maxDecelerationScrollTop ?? scrollTop, scrollTop),
				scroller.__minDecelerationScrollTop ?? scrollTop
			)
			if (scrollTopFixed !== scrollTop) {
				scrollTop = scrollTopFixed
				scroller.__decelerationVelocityY = 0
			}
		}

		//
		// UPDATE SCROLL POSITION
		//

		if (render) {
			scroller.__publish(scrollLeft, scrollTop, scroller.__zoomLevel)
		} else {
			scroller.__scrollLeft = scrollLeft
			scroller.__scrollTop = scrollTop
		}

		//
		// SLOW DOWN
		//

		// Slow down velocity on every iteration
		if (!scroller.options.paging) {
			// This is the factor applied to every iteration of the animation
			// to slow down the process. This should emulate natural behavior where
			// objects slow down when the initiator of the movement is removed
			const frictionFactor = 0.95

			scroller.__decelerationVelocityX *= frictionFactor
			scroller.__decelerationVelocityY *= frictionFactor
		}

		//
		// BOUNCING SUPPORT
		//

		if (scroller.options.bouncing) {
			let scrollOutsideX = 0
			let scrollOutsideY = 0

			// This configures the amount of change applied to deceleration/acceleration when reaching boundaries
			const penetrationDeceleration = scroller.options.penetrationDeceleration
			const penetrationAcceleration = scroller.options.penetrationAcceleration

			// Check limits
			if (
				scroller.__minDecelerationScrollLeft &&
				scrollLeft < scroller.__minDecelerationScrollLeft
			) {
				scrollOutsideX = scroller.__minDecelerationScrollLeft - scrollLeft
			} else if (
				scroller.__maxDecelerationScrollLeft &&
				scrollLeft > scroller.__maxDecelerationScrollLeft
			) {
				scrollOutsideX = scroller.__maxDecelerationScrollLeft - scrollLeft
			}

			if (scroller.__minDecelerationScrollTop && scrollTop < scroller.__minDecelerationScrollTop) {
				scrollOutsideY = scroller.__minDecelerationScrollTop - scrollTop
			} else if (
				scroller.__maxDecelerationScrollTop &&
				scrollTop > scroller.__maxDecelerationScrollTop
			) {
				scrollOutsideY = scroller.__maxDecelerationScrollTop - scrollTop
			}

			// Slow down until slow enough, then flip back to snap position
			if (scrollOutsideX !== 0) {
				if (penetrationDeceleration && scrollOutsideX * scroller.__decelerationVelocityX <= 0) {
					scroller.__decelerationVelocityX += scrollOutsideX * penetrationDeceleration
				} else if (penetrationAcceleration) {
					scroller.__decelerationVelocityX = scrollOutsideX * penetrationAcceleration
				}
			}

			if (scrollOutsideY !== 0) {
				if (penetrationDeceleration && scrollOutsideY * scroller.__decelerationVelocityY <= 0) {
					scroller.__decelerationVelocityY += scrollOutsideY * penetrationDeceleration
				} else if (penetrationAcceleration) {
					scroller.__decelerationVelocityY = scrollOutsideY * penetrationAcceleration
				}
			}
		}
	}

	return scroller
}

const DEFAULT_OPTIONS = {
	/** Enable scrolling on x-axis */
	scrollingX: true,

	/** Enable scrolling on y-axis */
	scrollingY: true,

	/** Enable animations for deceleration, snap back, zooming and scrolling */
	animating: true,

	/** duration for animations triggered by scrollTo/zoomTo */
	animationDuration: 250,

	/** Enable bouncing (content can be slowly moved outside and jumps back after releasing) */
	bouncing: true,

	/** Enable locking to the main axis if user moves only slightly on one of them at start */
	locking: true,

	/** Enable pagination mode (switching between full page content panes) */
	paging: false,

	/** Enable snapping of content to a configured pixel grid */
	snapping: false,

	/** Enable zooming of content via API, fingers and mouse wheel */
	zooming: false,

	/** Minimum zoom level */
	minZoom: 0.5,

	/** Maximum zoom level */
	maxZoom: 3,

	/** Multiply or decrease scrolling speed **/
	speedMultiplier: 1,

	/** Callback that is fired on the later of touch end or deceleration end,
			provided that another scrolling action has not begun. Used to know
			when to fade out a scrollbar. */
	scrollingComplete: () => {},

	/** This configures the amount of change applied to deceleration when reaching boundaries  **/
	penetrationDeceleration: 0.03,

	/** This configures the amount of change applied to acceleration when reaching boundaries  **/
	penetrationAcceleration: 0.08,
}

export type Scroller = ReturnType<typeof scrollerMembers> & {
	customRender: RenderFunction
	options: ScrollerOptions
}

/**
 * A pure logic 'component' for 'virtual' scrolling/zooming.
 */
export const MakeScroller = function (
	customRender: RenderFunction,
	options: ScrollerOptions
): Scroller {
	options = {
		...DEFAULT_OPTIONS,
		...options,
	}

	const scroller = scrollerMembers()
	scroller.customRender = customRender
	scroller.options = options

	return scroller
}
