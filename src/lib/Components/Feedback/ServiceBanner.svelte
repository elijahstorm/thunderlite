<script lang="ts">
	/**
	 * A thin bar shown while the backend is rate limited, counting down to the
	 * moment it should be usable again.
	 *
	 * The countdown is the whole point. The backend tells us exactly how long the
	 * wait is, and a number that visibly shrinks turns "something is broken" into
	 * "something is scheduled" — the same failure, minus the part that makes
	 * people reload, retry, and add to the load that caused it.
	 *
	 * Mounted once at the root so it covers every page. It only appears when the
	 * app has real evidence of a cooldown, so an ordinary session never sees it.
	 */
	import { serviceBusyFor } from '$lib/Stores/serviceHealth'

	// A one or two second blip is not worth a banner: the request that noticed it
	// has usually already succeeded on retry by the time anyone could read this.
	const MIN_SECONDS_TO_SHOW = 3

	let seconds = $derived($serviceBusyFor)
	let visible = $derived(seconds >= MIN_SECONDS_TO_SHOW)
</script>

{#if visible}
	<div class="service-banner" role="status" aria-live="polite">
		<span class="service-banner__dot" aria-hidden="true"></span>
		<span>Servers are busy. Full service returns in {seconds}s.</span>
	</div>
{/if}

<style>
	.service-banner {
		position: fixed;
		inset: 0 0 auto 0;
		z-index: 99;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.375rem 0.75rem;
		font-size: 0.8125rem;
		font-weight: 500;
		line-height: 1.2;
		text-align: center;
		color: #1c1917;
		background: #fbbf24;
		box-shadow: 0 1px 6px rgb(0 0 0 / 0.25);
		pointer-events: none;
	}

	.service-banner__dot {
		width: 0.5rem;
		height: 0.5rem;
		flex: none;
		border-radius: 9999px;
		background: #1c1917;
		animation: service-banner-pulse 1s ease-in-out infinite;
	}

	@keyframes service-banner-pulse {
		0%,
		100% {
			opacity: 0.35;
		}
		50% {
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.service-banner__dot {
			animation: none;
			opacity: 0.8;
		}
	}
</style>
