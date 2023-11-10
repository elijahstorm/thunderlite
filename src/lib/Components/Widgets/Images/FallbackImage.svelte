<script lang="ts">
	export let fallback: string = '/404.png'
	export let src: string = fallback
	export let alt: string
	export let cover = false
	export let tailwind = ''
	export let style = ''

	let img: HTMLImageElement

	const handleError = (e: unknown) => (img.src = fallback)

	$: {
		if (img && !img.src) {
			img.src = fallback
		}
	}
</script>

<img
	bind:this={img}
	class="w-full h-full {tailwind}"
	class:object-cover={cover}
	{style}
	{src}
	{alt}
	on:error={handleError}
/>
