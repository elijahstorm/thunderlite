<script lang="ts">
	export let selected: boolean = false
	export let action: VoidFunction
	export let size: number

	$: style = `width: ${size}px; height: ${size}px;`
</script>

<button
	on:click={action}
	class="border-2 border-black overflow-hidden transition-colors outline-none focus:border-yellow-300 focus:bg-yellow-100 hover:border-yellow-300 hover:bg-yellow-100"
	class:border-yellow-500={selected}
	class:bg-yellow-200={selected}
	{style}
>
	<slot />
</button>
