<script lang="ts">
	import Header from '$lib/Components/Branding/Header.svelte'

	export let logoLink: string = '/'
	export let toggleAside: VoidFunction | null = null
</script>

<Header {logoLink} {toggleAside} />

<div class="pb-16 flex justify-center">
	<div class="container w-full break break-word">
		<slot />
	</div>
</div>
