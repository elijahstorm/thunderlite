<script lang="ts">
	interface Props {
		icon?: string
		title?: string
		height?: number
		/** Mono strapline under the wordmark. Suppressed on small marks, where
		 *  it would set below legible size. Pass `null` to force it off. */
		strapline?: string | null
	}

	let {
		icon = '/images/logo/black-tank.png',
		title = 'ThunderLite',
		height = 150,
		strapline = 'TACTICAL COMMAND',
	}: Props = $props()

	// Split off a trailing "Lite" so we can two-tone the wordmark. Falls back to
	// rendering the whole string in the foreground if there's no such suffix.
	let head = $derived(title.replace(/lite$/i, ''))
	let tail = $derived(title.slice(head.length))
	// Under ~52px the strapline lands below 7px and the rule crowds the caps, so
	// the mark collapses to wordmark-only rather than printing something unread.
	let showStrapline = $derived(Boolean(strapline) && height >= 52)
</script>

<div class="logo" style="--logo-height: {height}px;">
	{#if icon}
		<div
			class="logo-icon"
			style="background-image: url({icon}); width: {height}px; height: {height}px;"
		></div>
	{/if}
	{#if title}
		<div class="wordmark">
			<div class="title">
				<span>{head}</span>{#if tail}<span class="accent">{tail}</span>{/if}
			</div>
			{#if showStrapline}
				<div class="strapline">
					<span class="tick"></span>
					{strapline}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.logo {
		display: inline-flex;
		align-items: center;
		gap: 0.35em;
	}
	.logo-icon {
		/* Reversed panels (the olive enlistment column) set this to invert the
		   inked silhouette, which would otherwise sink into a dark ground. */
		filter: var(--logo-icon-filter, none);
		background-position: center center;
		background-size: contain;
		background-repeat: no-repeat;
		flex-shrink: 0;
	}
	.wordmark {
		display: flex;
		flex-direction: column;
		gap: calc(var(--logo-height) * 0.06);
	}
	.title {
		font-family: var(--brand-display);
		font-size: calc(var(--logo-height) * 0.62);
		font-weight: 700;
		line-height: 0.9;
		/* Stencilled, so the caps are tracked open rather than pulled tight. */
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--foreground);
		white-space: nowrap;
	}
	.title .accent {
		color: var(--secondary);
	}
	.strapline {
		display: flex;
		align-items: center;
		gap: 0.5em;
		font-family: var(--brand-stamp);
		font-size: calc(var(--logo-height) * 0.13);
		font-weight: 500;
		letter-spacing: 0.34em;
		text-transform: uppercase;
		color: var(--muted-foreground);
		white-space: nowrap;
	}
	/* Hairline lead-in, the printed rule that runs off a folder label. */
	.tick {
		display: block;
		width: calc(var(--logo-height) * 0.16);
		height: 1px;
		background: var(--border-strong);
	}
</style>
