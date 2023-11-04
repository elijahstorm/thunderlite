<script lang="ts">
	export let fallback: string = '/404.png'
	export let src: string = fallback
	export let alt: string
	export let cover = false
	export let tailwind = ''

	let img: HTMLImageElement

	const handleError = (e: unknown) => (img.src = fallback)
</script>

<img
	bind:this={img}
	class="w-full h-full {tailwind}"
	class:object-cover={cover}
	{src}
	{alt}
	on:error={handleError}
/>
