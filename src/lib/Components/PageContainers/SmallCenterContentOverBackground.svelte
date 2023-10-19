<script lang="ts">
	import Logo from '$lib/Components/Branding/Logo.svelte'
</script>

<div class="flex flex-col p-16 pt-4 min-h-screen overflow-y-auto bg-brand-800 select-none">
	<div class="mt-0 mb-2 mx-auto max-w-xs max-h-full text-white">
		<Logo height={200} />
	</div>

	<div class="text-white">
		<slot />
	</div>
</div>
