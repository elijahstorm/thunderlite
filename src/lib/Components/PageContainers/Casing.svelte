<script lang="ts">
	import Header from '$lib/Components/Branding/Header.svelte'

	interface Props {
		logoLink?: string
		toggleAside?: VoidFunction | null
		children?: import('svelte').Snippet
	}

	let { logoLink = '/', toggleAside = null, children }: Props = $props()
</script>

<Header {logoLink} {toggleAside} />

<div class="container w-full break break-word pt-8 pb-16">
	{@render children?.()}
</div>
