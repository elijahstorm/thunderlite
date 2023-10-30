<script lang="ts">
	import HalfPageInfoAndGraphic from '$lib/Components/PageContainers/HalfPageInfoAndGraphic.svelte'
</script>

<HalfPageInfoAndGraphic>
	<div class="flex items-center">
		<card
			class="max-w-md min-w-[24rem] flex flex-col justify-center items-center self-center m-0 px-6 py-10 gap-6 rounded-2xl border border-brand-400 bg-[#ffffffee] transition-all"
		>
			<slot />
		</card>
	</div>
</HalfPageInfoAndGraphic>

<style>
	card {
		-webkit-backdrop-filter: blur(12px);
		backdrop-filter: blur(12px);
		background-image: linear-gradient(231deg, rgba(255, 255, 255, 0.01), rgba(255, 255, 255, 0.09));
		box-shadow: 0 20px 20px 1px rgba(4, 12, 37, 0.68);
	}
</style>
