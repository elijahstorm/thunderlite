<script lang="ts">
	import HalfPageInfoAndGraphic from '$lib/Components/PageContainers/HalfPageInfoAndGraphic.svelte'
	interface Props {
		children?: import('svelte').Snippet
	}

	let { children }: Props = $props()
</script>

<HalfPageInfoAndGraphic>
	<div class="card p-8 sm:p-10">
		{@render children?.()}
	</div>
</HalfPageInfoAndGraphic>
