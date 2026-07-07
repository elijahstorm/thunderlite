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
		<div class="absolute pt-[72px] inset-0 md:relative md:pt-6 md:pb-16">
			{@render children?.()}
		</div>
	</div>
</ContentWithFooter>
