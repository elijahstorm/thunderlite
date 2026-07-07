<script lang="ts">
	interface Props {
		map: MapDBData
	}

	let { map }: Props = $props()
</script>

<div class="h-full w-full bg-surface-2 overflow-hidden">
	{#if map.thumbnail}
		<img
			class="h-full w-full object-cover"
			src={map.thumbnail}
			alt="{map.name ?? 'Map'} thumbnail"
		/>
	{/if}
</div>
