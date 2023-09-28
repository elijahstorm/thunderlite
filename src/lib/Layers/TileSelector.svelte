<script lang="ts">
	export let interfacer: InterfaceInteraction

	const cellWidth = 60
	const cellHeight = 60

	const handleClick = (x: number, y: number) => {
		interfacer.selected.x = x
		interfacer.selected.y = y
	}
	const handleHover = (x: number, y: number) => {
		interfacer.hover.x = x
		interfacer.hover.y = y
	}
	const handleKeypress = (_key: string, _shiftKey: boolean) => {
		interfacer.key.key = _key
		interfacer.key.shift = _shiftKey
	}
</script>

<div class="flex flex-col">
	<p>
		{Math.floor(interfacer.selected.y / cellHeight)}, {Math.floor(
			interfacer.selected.x / cellWidth
		)}
	</p>
	<p>
		{Math.floor(interfacer.hover.y / cellHeight)}, {Math.floor(interfacer.hover.x / cellWidth)}
	</p>
	<p>{interfacer.key.key}</p>
	<p>{interfacer.key.shift}</p>
</div>

<slot {handleClick} {handleHover} {handleKeypress} {cellWidth} {cellHeight} />
