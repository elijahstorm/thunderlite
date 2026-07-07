<script lang="ts">
	interface Props {
		fallback?: string
		src?: string
		alt: string
		cover?: boolean
		tailwind?: string
		style?: string
	}

	let {
		fallback = '/404.png',
		src = fallback,
		alt,
		cover = false,
		tailwind = '',
		style = '',
	}: Props = $props()

	let img = $state<HTMLImageElement>()

	const handleError = (e: unknown) => {
		if (img) img.src = fallback
	}

	$effect(() => {
		if (img && !img.src) {
			img.src = fallback
		}
	})
</script>

<img
	bind:this={img}
	class="w-full h-full {tailwind}"
	class:object-cover={cover}
	{style}
	{src}
	{alt}
	onerror={handleError}
/>
