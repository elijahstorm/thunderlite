<script lang="ts">
	import MapRender from './MapRender.svelte'

	let map = {
		rows: 10,
		cols: 10,
	}
</script>

<MapRender {map}></MapRender>
