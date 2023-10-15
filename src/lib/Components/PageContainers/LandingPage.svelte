<script lang="ts">
	import Hero from '$lib/Components/PageContainers/Home/Hero.svelte'
	import Motivation from '$lib/Components/PageContainers/Home/Motivation.svelte'
</script>

<div class="relative overflow-hidden">
	<div class="hidden lg:block w-full h-full absolute">
		<div
			class="bg-image-mockups absolute z-20 w-full h-full bg-no-repeat bg-auto bg-right-top -right-72 xl:-right-28"
		/>
	</div>

	<Hero />

	<Motivation />
</div>
