<script lang="ts">
	import Header from '$lib/Components/Branding/Header.svelte'

	export let logoLink: string = '/'
	export let toggleAside: VoidFunction | null = null
</script>

<Header {logoLink} {toggleAside} />

<div class="container w-full break break-word pt-8 pb-16">
	<slot></slot>
</div>
