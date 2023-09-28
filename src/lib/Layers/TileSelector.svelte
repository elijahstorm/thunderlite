<script lang="ts">
	let clickX: number
	let clickY: number

	let key: string
	let shift: boolean

	const handleClick = (x: number, y: number) => {
		clickX = x
		clickY = y
	}
	const handleKeypress = (_key: string, _shiftKey: boolean) => {
		key = _key
		shift = _shiftKey
	}
</script>

<div class="flex flex-col">
	<p>{clickX}</p>
	<p>{clickY}</p>
	<p>{key}</p>
	<p>{shift}</p>
</div>

<slot {handleClick} {handleKeypress} />
