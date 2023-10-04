<script lang="ts">
	export let interfacer: InterfaceInteraction
	export let select: (x: number, y: number) => void
	export let validTile: (x: number, y: number) => boolean

	const cellWidth = 60
	const cellHeight = 60

	const handleClick = (_x: number, _y: number) => {
		const [x, y] = [tileX(_x), tileY(_y)]
		if (!validTile(x, y)) return
		select(x, y)
		interfacer.selected = { x, y }
	}
	const handleHover = (_x: number, _y: number) => {
		const [x, y] = [tileX(_x), tileY(_y)]
		if (!validTile(x, y)) return
		interfacer.hover = { x, y }
	}
	const handleOffset = (x: number, y: number, zoom: number) => {
		interfacer.offset = { x, y, zoom }
	}
	const handleKeypress = (_key: string, _shiftKey: boolean) => {
		interfacer.key.key = _key
		interfacer.key.shift = _shiftKey
	}

	const tileX = (x: number) => Math.floor(x / cellWidth)
	const tileY = (y: number) => Math.floor(y / cellHeight)

	$: selectedStyles = `left: ${interfacer.selected.x * cellWidth - interfacer.offset.x}px; top: ${
		interfacer.selected.y * cellHeight - interfacer.offset.y
	}px; width: ${cellWidth}px; height: ${cellHeight}px`
	$: hoveredStyles = `left: ${interfacer.hover.x * cellWidth - interfacer.offset.x}px; top: ${
		interfacer.hover.y * cellHeight - interfacer.offset.y
	}px; width: ${cellWidth}px; height: ${cellHeight}px`
</script>

<section class="grid flex-grow overflow-clip">
	<div class="col-start-1 row-start-1 cursor-pointer">
		<slot {handleClick} {handleHover} {handleKeypress} {handleOffset} {cellWidth} {cellHeight} />
	</div>

	<div class="col-start-1 row-start-1 pointer-events-none relative">
		<div class="absolute border-2 border-red-500" style={selectedStyles} />
		<div class="absolute bg-yellow-500 opacity-30" style={hoveredStyles} />
	</div>
</section>
