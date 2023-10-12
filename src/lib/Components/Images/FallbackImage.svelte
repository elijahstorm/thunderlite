<script lang="ts">
	export let fallback: string = '/404.png'
	export let src: string = fallback
	export let alt: string
	export let cover = false
	export let tailwind = ''

	let image: HTMLImageElement

	let classList: string
	$: classList = `w-full h-full ${tailwind}`
</script>

<img
	bind:this={image}
	class={classList}
	class:object-cover={cover}
	{src}
	{alt}
	on:error={() => (image.src = fallback)}
/>
