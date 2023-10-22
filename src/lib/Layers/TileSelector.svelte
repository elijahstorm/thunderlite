<script lang="ts">
	export let interfacer: InterfaceInteraction
	export let select: (x: number, y: number) => void
	export let validTile: (x: number, y: number) => boolean
	export let mini: boolean = false

	const cellWidth = mini ? 20 : 60
	const cellHeight = cellWidth

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

	const position: (tile: { x: number; y: number }) => string = ({ x, y }) =>
		`left: ${x * cellWidth - interfacer.offset.x}px; top: ${
			y * cellHeight - interfacer.offset.y
		}px; width: ${cellWidth}px; height: ${cellHeight}px`
</script>

<section class="grid flex-grow overflow-clip">
	<div class="col-start-1 row-start-1 cursor-pointer">
		<slot {handleClick} {handleHover} {handleKeypress} {handleOffset} {cellWidth} {cellHeight} />
	</div>

	{#if !mini}
		<div class="col-start-1 row-start-1 pointer-events-none relative">
			<img
				class="absolute"
				src="/game/play/icon/move/hover.png"
				style={position(interfacer.hover)}
				alt="hovered tile"
			/>
			<img
				class="absolute"
				src="/game/play/icon/move/selected.png"
				style={position(interfacer.selected)}
				alt="selected tile"
			/>
		</div>
	{/if}
</section>
