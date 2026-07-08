<script lang="ts">
	interface Props {
		icon?: string
		title?: string
		height?: number
	}

	let {
		icon = '/images/logo/black-tank.png',
		title = 'ThunderLite',
		height = 150,
	}: Props = $props()

	// Split off a trailing "Lite" so we can two-tone the wordmark. Falls back to
	// rendering the whole string in the foreground if there's no such suffix.
	let head = $derived(title.replace(/lite$/i, ''))
	let tail = $derived(title.slice(head.length))
</script>

<div class="logo" style="--logo-height: {height}px;">
	{#if icon}
		<div
			class="logo-icon"
			style="background-image: url({icon}); width: {height}px; height: {height}px;"
		></div>
	{/if}
	{#if title}
		<div class="title">
			<span>{head}</span>{#if tail}<span class="accent">{tail}</span>{/if}
		</div>
	{/if}
</div>

<style>
	.logo {
		display: inline-flex;
		align-items: center;
		gap: 0.4em;
	}
	.logo-icon {
		background-position: center center;
		background-size: contain;
		background-repeat: no-repeat;
		flex-shrink: 0;
	}
	.title {
		font-size: calc(var(--logo-height) * 0.56);
		font-weight: 800;
		line-height: 1;
		letter-spacing: -0.03em;
		color: var(--foreground);
		white-space: nowrap;
		font-feature-settings: 'ss01';
	}
	.title .accent {
		color: var(--primary);
	}
</style>
