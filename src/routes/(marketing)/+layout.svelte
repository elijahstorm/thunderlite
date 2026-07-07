<script lang="ts">
	import ContentWithFooter from '$lib/Components/PageContainers/ContentWithFooter.svelte'
	interface Props {
		children?: import('svelte').Snippet
	}

	let { children }: Props = $props()
</script>

<ContentWithFooter>
	{@render children?.()}
</ContentWithFooter>
