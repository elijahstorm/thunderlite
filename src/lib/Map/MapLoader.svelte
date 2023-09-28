<script lang="ts">
	import MapRender from './MapRender.svelte'

	let map = {
		rows: 100,
		cols: 100,
	}
</script>

<MapRender {map}></MapRender>
