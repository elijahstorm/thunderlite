<script lang="ts">
	/**
	 * A thin top-of-viewport progress bar shown during SvelteKit client-side
	 * navigation. Server `load` functions on routes like /make and /play take a
	 * couple of seconds, and without this the app feels frozen after a click.
	 *
	 * Driven by `$app/state`'s `navigating` — any <a> click or goto() that starts
	 * a navigation flips `navigating.to` to a non-null value, so this covers the
	 * whole app with no per-page wiring. Uses the classic "trickle toward 90%,
	 * snap to 100% on complete" behaviour so the bar keeps moving even when we
	 * don't know how long the load will take.
	 */
	import { navigating } from '$app/state'

	let visible = $state(false)
	let width = $state(0)

	// Non-reactive bookkeeping so the effect below only re-runs on navigation
	// changes, never on our own width/visibility writes.
	let showing = false
	let trickleTimer: ReturnType<typeof setTimeout> | undefined
	let hideTimer: ReturnType<typeof setTimeout> | undefined

	const trickle = () => {
		clearTimeout(trickleTimer)
		trickleTimer = setTimeout(() => {
			if (!showing) return
			// Ease toward 90% and stall there until the navigation completes.
			width = Math.min(90, width + (90 - width) * 0.18)
			trickle()
		}, 350)
	}

	const start = () => {
		clearTimeout(hideTimer)
		if (showing) return
		showing = true
		visible = true
		width = 8
		trickle()
	}

	const done = () => {
		if (!showing) return
		showing = false
		clearTimeout(trickleTimer)
		width = 100
		hideTimer = setTimeout(() => {
			visible = false
			width = 0
		}, 280)
	}

	$effect(() => {
		if (navigating.to) start()
		else done()
	})
</script>

{#if visible}
	<div class="nav-progress" role="progressbar" aria-label="Loading page" aria-hidden="true">
		<div class="nav-progress__bar" style:width="{width}%" class:is-done={width >= 100}></div>
	</div>
{/if}

<style>
	.nav-progress {
		position: fixed;
		inset: 0 0 auto 0;
		height: 3px;
		z-index: 100;
		pointer-events: none;
	}

	.nav-progress__bar {
		height: 100%;
		background: var(--secondary);
		box-shadow:
			0 0 8px var(--secondary),
			0 0 4px var(--secondary);
		transition: width 0.28s ease-out;
		border-radius: 0 2px 2px 0;
	}

	.nav-progress__bar.is-done {
		opacity: 0;
		transition:
			width 0.18s ease-in,
			opacity 0.28s ease-in 0.1s;
	}
</style>
