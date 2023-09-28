<script lang="ts">
	export let map: MapObject

	let select = (x: number, y: number) => [x, y]
	let validTile = (x: number, y: number) => x < rows && y < cols

	const interfacer: InterfaceInteraction = (() => {
		return {
			selected: { x: -1, y: -1 },
			hover: { x: -1, y: -1 },
			offset: { x: 0, y: 0, zoom: 1 },
			key: { key: '', shift: false },
		}
	})()

	let rows = map.rows
	let cols = map.cols
</script>

<slot {interfacer} {select} {validTile} {rows} {cols} />
