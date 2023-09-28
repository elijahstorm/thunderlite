<script lang="ts">
	export let map: MapObject

	const interfacer: InterfaceInteraction = (() => {
		return {
			selected: { x: -1, y: -1 },
			key: { key: '', shift: false },
		}
	})()

	let rows = map.rows
	let cols = map.cols
</script>

<slot {interfacer} {rows} {cols} />
