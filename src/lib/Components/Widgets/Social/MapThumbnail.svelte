<script lang="ts">
	export let map: MapDBData
</script>

<div class="mt-4 w-full h-64 rounded-md overflow-hidden border-2 border-gray-300 bg-gray-200">
	<img class="w-full h-full object-cover" src={map.thumbnail} alt="{map.name} thumbnail" />
</div>
