<script lang="ts">
	export let fallback: string = ''
	export let src: string | null | undefined = undefined
	export let alt: string
	export let cover = false
	export let tailwind = ''

	let failed = false
	let lastSrc: string | null | undefined

	// Reset the failed flag whenever a new source comes in, so a previously
	// broken image doesn't keep the silhouette pinned after src updates.
	$: if (src !== lastSrc) {
		lastSrc = src
		failed = false
	}

	$: resolvedSrc = (!failed && (src || fallback)) || null

	let classList: string
	$: classList = `w-full h-full ${tailwind}`
</script>

{#if resolvedSrc}
	<img
		class={classList}
		class:object-cover={cover}
		src={resolvedSrc}
		{alt}
		on:error={() => (failed = true)}
	/>
{:else}
	<!-- Built-in "human" silhouette, like Instagram/KakaoTalk default avatars. -->
	<div class="flex h-full w-full items-center justify-center bg-surface-2 text-border-strong" role="img" aria-label={alt}>
		<svg class="h-3/5 w-3/5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M12 12c2.7 0 4.9-2.2 4.9-4.9S14.7 2.2 12 2.2 7.1 4.4 7.1 7.1 9.3 12 12 12Zm0 2.2c-3.3 0-9.8 1.6-9.8 4.9v1.4c0 .6.5 1.1 1.1 1.1h17.4c.6 0 1.1-.5 1.1-1.1v-1.4c0-3.3-6.5-4.9-9.8-4.9Z" />
		</svg>
	</div>
{/if}
