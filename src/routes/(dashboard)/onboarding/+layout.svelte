<script lang="ts">
	import Header from '$lib/Components/Branding/Header.svelte'
	import ContentWithFooter from '$lib/Components/PageContainers/ContentWithFooter.svelte'
	interface Props {
		children?: import('svelte').Snippet
	}

	let { children }: Props = $props()
</script>

<ContentWithFooter noFooterOnMobile>
	<Header />

	<div class="md:container w-full break break-word">
		{@render children?.()}
	</div>
</ContentWithFooter>
